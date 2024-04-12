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
const mandatoryElements = require('../compartment-definition/mandatory-elements');
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
  try {
    const searchParameterList = getSearchParameters(resourceType, '4_0_1');
    searchParameterList.forEach(paramDef => {
      // map xpath to parameter description
      {
        searchParams[paramDef.xpath.substring(paramDef.xpath.indexOf('.') + 1)] = paramDef;
      }
    });
    return searchParams;
  } catch (e) {
    return {};
  }
};

/**
 * Exports the list of resources included in the _type parameter to NDJSON, filtered according to the
 * FHIR queries included in the _typeFilter parameter.
 * If the _type parameter doesn't exist, the function will simply export all resource types included in the supportedResources list.
 * If the _typeFilter parameter is defined but the _type parameter is *not* defined, the function will export all resource types
 * included in the supportedResources list, but the resource types specified in the _typeFilter query will be filtered.
 * @param {string} clientId  an id to add to the file name so the client making the request can be tracked
 * @param {Array} types Array of types to be queried for, retrieved from request params
 * @param {string} typeFilter String of comma separated FHIR REST search queries
 * @param {string | Array} patient Patient references from the "patient" param, used to filter results
 * @param {boolean} systemLevelExport boolean flag from job that signals whether request is for system-level export (determines filtering)
 * @param {Array} patientIds Array of patient ids for patients relevant to this export (undefined if all patients)
 */
const exportToNDJson = async (clientId, types, typeFilter, patient, systemLevelExport, patientIds, elements) => {
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

    const elementsQueries = {};
    // create lookup object for _elements parameter
    if (elements) {
      elements.forEach(e => {
        let resourceType = 'all';
        let elementName;
        if (e.includes('.')) {
          resourceType = e.split('.')[0];
          elementName = e.split('.')[1];
          if (elementsQueries[resourceType]) {
            elementsQueries[resourceType].push(elementName);
          } else {
            elementsQueries[resourceType] = [elementName];
          }
        } else {
          elementName = e;
          supportedResources.forEach(resourceType => {
            if (elementsQueries[resourceType]) {
              elementsQueries[resourceType].push(elementName);
            } else {
              elementsQueries[resourceType] = [elementName];
            }
          });
        }
      });
    }

    const exportTypes = systemLevelExport ? requestTypes.filter(t => t !== 'ValueSet') : requestTypes;

    // if 'patient' parameter is present, apply additional filtering on the resources related to these patients
    // strip off '.reference' to align with the format of the patientIds array
    const patientParamIds = patient?.map(p => {
      const splitRef = p.reference.split('/');
      return splitRef[splitRef.length - 1];
    });

    let docs = exportTypes.map(async collectionName => {
      return getDocuments(
        collectionName,
        searchParameterQueries[collectionName],
        valueSetQueries[collectionName],
        patientParamIds || patientIds,
        elementsQueries[collectionName]
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
 * @param {Array} elements Array of elements queries for the given resource type
 * @returns {Object} An object containing all data from the given collection name as well as the collection name
 */
const getDocuments = async (collectionName, searchParameterQueries, valueSetQueries, patientIds, elements) => {
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

  // create elements projection
  const projection = { _id: 0 };
  if (elements) {
    elements.forEach(elem => {
      projection[elem] = 1;
    });

    // add a projection of 1 for mandatory elements for the resourceType as defined by the StructureDefinition of the resourceType
    // mandatory elements are elements that have min cardinality of 1
    mandatoryElements[collectionName].forEach(elem => {
      projection[elem] = 1;
    });

    // add a projection of 1 for resourceType which we have determined to be a mandatory element for each FHIR resource even though
    // it is not included in the StructureDefinition
    projection['resourceType'] = 1;
  }

  if (searchParameterQueries) {
    docs = searchParameterQueries.map(async q => {
      let query = q;
      // wherever we have a $match, we need to add another "and" operator containing the ValueSet and/or patient query
      if (Object.keys(vsQuery).length > 0) {
        query.filter(q => '$match' in q).forEach(q => (q['$match'] = { $and: [q['$match'], vsQuery] }));
      }
      if (Object.keys(patQuery).length > 0) {
        query.filter(q => '$match' in q).forEach(q => (q['$match'] = { $and: [q['$match'], patQuery] }));
      }
      // grab the results from aggregation - has metadata about counts and data with resources in the first array position
      const results = await findResourcesWithAggregation(query, collectionName, projection);
      return results || [];
    });
    // use flatMap to flatten the output from aggregation
    docs = (await Promise.all(docs)).flatMap(r => r);
  } else if (vsQuery || patQuery) {
    const query = {
      $and: [vsQuery, patQuery]
    };
    docs = await findResourcesWithQuery(query, collectionName, { projection: projection });
  } else {
    docs = await findResourcesWithQuery({}, collectionName, { projection: projection });
  }

  // add the SUBSETTED tag to the resources returned when the _elements parameter is used
  if (elements) {
    docs.map(doc => {
      if (doc.meta) {
        if (doc.meta.tag) {
          doc.meta.tag.push({ code: 'SUBSETTED', system: 'http://terminology.hl7.org/CodeSystem/v3-ObservationValue' });
        } else {
          doc.meta.tag = [{ code: 'SUBSETTED', system: 'http://terminology.hl7.org/CodeSystem/v3-ObservationValue' }];
        }
      } else {
        doc.meta = {
          tag: [{ code: 'SUBSETTED', system: 'http://terminology.hl7.org/CodeSystem/v3-ObservationValue' }]
        };
      }
    });
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
 * Processes the _typeFilter queries that reference a ValueSet for a single resource type. For each query parameter,
 * retrieves the ValueSet resource, extracts the codes from the ValueSet, and generates the appropriate code-level queries.
 * Throws error if ValueSet cannot be found in the database.
 * @param {Object} valueSetQueries collection of query parameters that map to ValueSets
 * @returns {Object} an $or query object to be run as part of the export
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

module.exports = { exportToNDJson, patientsQueryForType, getDocuments, buildSearchParamList };
