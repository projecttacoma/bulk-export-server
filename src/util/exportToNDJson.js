const { getCodesFromValueSet } = require('./valueSetHelper');
const supportedResources = require('./supportedResources');
const fs = require('fs');
const path = require('path');
const {
  updateBulkExportStatus,
  BULKSTATUS_COMPLETED,
  BULKSTATUS_FAILED,
  findOneResourceWithQuery,
  findResourcesWithQuery,
  findResourceById,
  findResourcesWithAggregation
} = require('./mongo.controller');
const patientRefs = require('../compartment-definition/patient-references');
const QueryBuilder = require('@asymmetrik/fhir-qb');
const { getSearchParameters } = require('@projecttacoma/node-fhir-server-core');

const qb = new QueryBuilder({ implementationParameters: { archivedParamPath: '_isArchived' } });

/**
 * Uses Asymmetrik's getSearchParameters function to retrieve the valid search parameters for a given
 * resource type. Builds a mapping of the search parameter xpath to the parameter definition, which
 * contains the version, name, type, fhirtype, xpath, definition, and description.
 * @param {string} resourceType FHIR resource type provided for export
 * @returns Record of valid search parameters and their associated data
 */
const buildSearchParamList = resourceType => {
  const searchParams = {};
  // get search parameters for FHIR Version 4.0.1
  const searchParameterList = getSearchParameters(resourceType, '4_0_1');
  searchParameterList.forEach(paramDef => {
    // map xpath to parameter description
    {
      searchParams[paramDef.xpath.substring(paramDef.xpath.indexOf('.') + 1)] = paramDef;
    }
  });
  return searchParams;
};

/**
 * Exports the list of resources included in the _type parameter to NDJSON, filtered according to the
 * FHIR queries included in the _typeFilter parameter.
 * If the _type parameter doesn't exist, the function will simply export all resource types included in the supportedResources list.
 * @param {string} clientId  an id to add to the file name so the client making the request can be tracked
 * @param {Array} types Array of types to be queried for, retrieved from request params
 * @param {string} typeFilter String of comma separated FHIR REST search queries
 * @param {boolean} systemLevelExport boolean flag from job that signals whether request is for system-level export (determines filtering)
 * @param {Array} patientIds Array of patient ids for patients relevant to this export (undefined if all patients)
 */
const exportToNDJson = async (clientId, types, typeFilter, systemLevelExport, patientIds) => {
  try {
    const dirpath = './tmp/';
    fs.mkdirSync(dirpath, { recursive: true });
    let requestTypes = [];
    if (types) {
      // filter requested resource types to those specified with the _type parameter
      requestTypes = types;
    } else {
      // create list of requested types if request.query._type param doesn't exist
      requestTypes.push(...supportedResources);
    }
    // create lookup objects for (1) _typeFilter queries that contain search parameters, and (2) _typeFilter
    // queries that contain type:in/code:in/etc. queries
    const searchParameterQueries = {};
    const valueSetQueries = {};
    if (typeFilter) {
      // subqueries may be joined together with a comma for a logical "or"
      const tyq = typeFilter.split(',');
      // loop over each subquery and extract all search params, which are joined via the "&" operator
      // each subquery is of the format <resource type>?<query>
      tyq.forEach(query => {
        const resourceType = query.substring(0, query.indexOf('?'));
        // build mapping of search parameters for the given resource type
        const searchParams = buildSearchParamList(resourceType);
        // extract all properties that may be part of the same subquery via the "&" operator
        const properties = query.substring(query.indexOf('?') + 1).split('&');
        // create mapping of properties to their values within the given subquery
        const subqueries = {};
        properties.forEach(p => {
          const property = p.substring(0, p.indexOf('='));
          const propertyValue = p.substring(p.indexOf('=') + 1);
          // type:in, code:in, etc.
          if (property.endsWith(':in')) {
            if (valueSetQueries[resourceType]) {
              if (valueSetQueries[resourceType][property]) {
                valueSetQueries[resourceType][property].push(propertyValue);
              } else {
                valueSetQueries[resourceType][property] = [propertyValue];
              }
            } else {
              valueSetQueries[resourceType] = { [property]: [propertyValue] };
            }
          } else {
            subqueries[property] = propertyValue;
          }
        });
        // pass all search parameter-related _typeFilter queries into the Asymmetrik query builder
        if (Object.keys(subqueries).length > 0) {
          const filter = qb.buildSearchQuery({
            req: { method: 'GET', query: subqueries, params: {} },
            parameterDefinitions: searchParams,
            includeArchived: true
          });
          if (filter.query) {
            if (searchParameterQueries[resourceType]) {
              searchParameterQueries[resourceType].push(filter.query);
            } else {
              searchParameterQueries[resourceType] = [filter.query];
            }
          }
        }
      });
    }
    const exportTypes = systemLevelExport ? requestTypes.filter(t => t !== 'ValueSet') : requestTypes;
    let docs = exportTypes.map(async collectionName => {
      return getDocuments(
        collectionName,
        searchParameterQueries[collectionName],
        valueSetQueries[collectionName],
        patientIds
      );
    });
    docs = await Promise.all(docs);
    docs.forEach(doc => {
      if (doc.document) {
        writeToFile(doc.document, doc.collectionName, clientId);
      }
    });

    /* 
     TODO: if we want to catch and report any warnings, push them to the
     bulkstatus warning array when they occur, then use the createOperationOutcome
     function here to convert the error object into an OperationOutcome and write
     it to a file. Right now the below code breaks our tests, but after we upgrade
     to use a job queue, the warning catch could work like this:

     const { warnings } = await findResourceById(clientId, 'bulkExportStatuses');

     if (warnings.length > 0) {
       const opOuts = warnings.map(w => createOperationOutcome(w.message));
       writeToFile(opOuts, 'OperationOutcome', clientId);
     } 
    */

    // mark bulk status job as complete after all files have been written
    await updateBulkExportStatus(clientId, BULKSTATUS_COMPLETED);
    return true;
  } catch (e) {
    await updateBulkExportStatus(clientId, BULKSTATUS_FAILED, { message: e.message, code: 500 });
    return false;
  }
};

/**
 * Retrieves all documents from the requested collection and wraps them in an object with the collection name
 * @param {string} collectionName The collection of interest in the mongodb
 * @param {Object} searchParameterQueries The _typeFilter search parameter queries for the given resource type
 * @param {Object} valueSetQueries list of ValueSet-related queries for the given resource type
 * @param {Array} patientIds Array of patient ids for which the returned documents should have references
 * @returns {Object} An object containing all data from the given collection name as well as the collection name
 */
const getDocuments = async (collectionName, searchParameterQueries, valueSetQueries, patientIds) => {
  let docs = [];
  let patQuery = {};
  let vsQuery = {};
  // Create patient id query (for Group export only)
  if (patientIds) {
    if (patientIds.length == 0) {
      // if no patients in group, return no documents
      return { document: [], collectionName: collectionName };
    }
    if (collectionName === 'Patient') {
      // simple patient id query
      patQuery = { id: { $in: patientIds } };
    } else {
      patQuery = await patientsQueryForType(patientIds, collectionName);
    }
  }

  if (valueSetQueries) {
    // extract codes from the ValueSet queries to use for filtering
    vsQuery = await processVSTypeFilter(valueSetQueries);
  }

  if (searchParameterQueries) {
    docs = searchParameterQueries.map(async q => {
      let query = q;
      // wherever we have a $match, we need to add another "and" operator containing the ValueSet and/or patient query
      if (vsQuery) {
        query.filter(q => '$match' in q).forEach(q => (q['$match'] = { $and: [q['$match'], vsQuery] }));
      }
      if (patQuery) {
        query.filter(q => '$match' in q).forEach(q => (q['$match'] = { $and: [q['$match'], patQuery] }));
      }
      // grab the results from aggregation - has metadata about counts and data with resources in the first array position
      const results = (await findResourcesWithAggregation(query, collectionName, { projection: { _id: 0 } }))[0];
      if (results && results.metadata[0]) {
        return results.data;
      } else return [];
    });
    // use flatMap to flatten the output from aggregation
    docs = (await Promise.all(docs)).flatMap(r => r);
  } else if (vsQuery || patQuery) {
    const query = {
      $and: [vsQuery, patQuery]
    };
    docs = await findResourcesWithQuery(query, collectionName, { projection: { _id: 0 } });
  } else {
    docs = await findResourcesWithQuery({}, collectionName, { projection: { _id: 0 } });
  }
  return { document: docs, collectionName: collectionName };
};

/**
 * Writes the contents of a mongo document to an ndjson file with the appropriate resource
 * name, stored in a directory under the client's id
 * @param {Object} doc A mongodb document containing fhir resources
 * @param {string} type The fhir resourceType contained in the mongo document
 * @param {string} clientId The id of the client making the export request
 * @returns
 */
const writeToFile = function (doc, type, clientId) {
  let dirpath = './tmp/' + clientId;
  fs.mkdirSync(dirpath, { recursive: true });
  const filename = path.join(dirpath, `${type}.ndjson`);

  let lineCount = 0;
  if (Object.keys(doc).length > 0) {
    const stream = fs.createWriteStream(filename, { flags: 'a' });
    doc.forEach(d => {
      stream.write((++lineCount === 1 ? '' : '\r\n') + JSON.stringify(d));
    });
    stream.end();
  } else return;
};
/**
 * Processes the entry in the _typeFilter parameter and performs the lookup to determine if the type and code are present
 * in the listed ValueSet. Only relevant for _typeFilter queries that reference a ValueSet.
 * @param {Object} valueSetQueries an entry in the _typefilter to perform the valueSet lookup with
 * @returns {Object} a query object to be run as part of the export
 */
const processVSTypeFilter = async function (valueSetQueries) {
  let queryArray = [];
  if (valueSetQueries) {
    for (const property in valueSetQueries) {
      let results = valueSetQueries[property].map(async value => {
        let vs = await findOneResourceWithQuery({ url: value }, 'ValueSet');
        // throw an error if we don't have the value set
        if (!vs) {
          throw new Error('Value set was not found in the database');
        }
        const vsResolved = getCodesFromValueSet(vs);
        // extract the property (i.e. code, type)
        const strippedProperty = property.substring(0, property.indexOf(':'));
        vsResolved.forEach(code => {
          queryArray.push({ [`${strippedProperty}.coding.code`]: code.code });
        });
      });
      await Promise.all(results);
    }
  }

  return {
    $or: queryArray
  };
};

/**
 * Creates a mongodb query object that only selects resources of the input type that
 * have references to the input patientIds
 * @param {Array} patientIds an array of the relevant patient id strings
 * @param {string} type the resource type to be found
 * @returns {Object} a query object that limits resources to those with certain patient references
 */
const patientsQueryForType = async function (patientIds, type) {
  const patQueries = patientIds.map(async patientId => {
    const patient = await findResourceById(patientId, 'Patient');
    if (!patient) {
      throw new Error(`Patient with id ${patientId} does not exist in the server`);
    }
    // for this resource type, go through all keys that can reference patient
    const allQueries = patientRefs[type].map(refKey => {
      const query = {};
      query[`${refKey}.reference`] = `Patient/${patientId}`;
      return query;
    });
    return { $or: allQueries };
  });
  const results = await Promise.all(patQueries);
  return { $or: results };
};

module.exports = { exportToNDJson, patientsQueryForType, getDocuments };
