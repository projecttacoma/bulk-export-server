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
  findResourceById
} = require('./mongo.controller');
const patientRefs = require('../compartment-definition/patient-references');
const QueryBuilder = require('@asymmetrik/fhir-qb');
const { getSearchParameters } = require('@projecttacoma/node-fhir-server-core');

const qb = new QueryBuilder({ implementationParameters: { archivedParamPath: '_isArchived' } });

const buildSearchParamList = resourceType => {
  const searchParams = {};
  const searchParameterList = getSearchParameters(resourceType, '4_0_1');
  searchParameterList.forEach(paramDef => {
    {
      searchParams[paramDef.name] = paramDef;
    }
  });
  return searchParams;
};
/**
 * Exports the list of resources included in the _type member of the request object to NDJson
 * if the _type member doesn't exist it will simply export everything included in the supportedResources list
 * @param {string} clientId  an id to add to the file name so the client making the request can be tracked
 * @param {Array} types Array of types to be queried for, retrieved from request params
 * @param {string} typeFilter String of comma separated FHIR REST search queries
 * @param {boolean} systemLevelExport boolean flag from job that signals whether request is for system-level export (determines filtering)
 * @param {Array} patientIds Array of patient ids for patients relevant to this export (undefined if all patients)
 */
const exportToNDJson = async (clientId, types, typeFilter, systemLevelExport, patientIds) => {
  try {
    let dirpath = './tmp/';
    fs.mkdirSync(dirpath, { recursive: true });
    let requestTypes = [];
    if (types) {
      requestTypes = types; // this is the list types to export
    } else {
      // create list of requested types if request.query._type param doesn't exist
      requestTypes.push(...supportedResources);
    }
    let typefilterLookup = {};
    if (typeFilter) {
      let tyq = typeFilter.split(',');
      // loop over each query
      tyq.forEach(line => {
        const resourceType = line.substring(0, line.indexOf('?'));
        // build mapping of search parameters for the given resource type
        const searchParams = buildSearchParamList(resourceType);
        const properties = line.substring(line.indexOf('?') + 1).split('&');
        const subqueries = {};
        properties.forEach(p => {
          const property = p.substring(0, p.indexOf('='));
          const propertyValue = p.substring(p.indexOf('=') + 1);
          subqueries[property] = propertyValue;
        });
        const filter = qb.buildSearchQuery({
          req: { method: 'GET', query: subqueries, params: {} },
          parameterDefinitions: searchParams
        });
        if (filter.query) {
          if (typefilterLookup[resourceType]) {
            typefilterLookup[resourceType].push(filter.query);
          } else {
            typefilterLookup[resourceType] = [filter.query];
          }
        }
      });
    }

    let docs = systemLevelExport ? requestTypes.filter(t => t !== 'ValueSet') : requestTypes;
    docs = docs.map(async element => {
      return getDocuments(element, typefilterLookup, patientIds);
    });
    docs = await Promise.all(docs);
    docs.forEach(doc => {
      writeToFile(doc.document, doc.collectionName, clientId);
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
 * @param {Object} typefilterLookup The entry in the _typeFilter that should be used to filter data to be exported
 * from the server
 * @param {Array} patientIds Array of patient ids for which the returned documents should have references
 * @returns {Object} An object containing all data from the given collection name as well as the collection name
 */
const getDocuments = async (collectionName, typefilterLookup, patientIds) => {
  let query = {};
  if (typefilterLookup[collectionName]) {
    query = await processTypeFilter(typefilterLookup[collectionName]);
  }
  // Group export
  if (patientIds) {
    if (patientIds.length == 0) {
      // if no patients in group, return no documents
      return { document: [], collectionName: collectionName };
    }
    let patQuery;
    if (collectionName === 'Patient') {
      // simple patient id query
      patQuery = { id: { $in: patientIds } };
    } else {
      patQuery = await patientsQueryForType(patientIds, collectionName);
    }
    // $and patient filtering with existing query
    query = {
      $and: [query, patQuery]
    };
  }

  const doc = await findResourcesWithQuery(query, collectionName, { projection: { _id: 0 } });
  return { document: doc, collectionName: collectionName };
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
    doc.forEach(function (doc) {
      stream.write((++lineCount === 1 ? '' : '\r\n') + JSON.stringify(doc));
    });
    stream.end();
  } else return;
};
/**
 * Processes the  entry in the _typeFilter and performs the lookup to determine if the type and code are present
 * in the listed value set.
 * @param {Object} typefilterLookupEntry an entry in the _typefilter to perform the valueSet lookup with
 * @returns {Object} a query object to be run as part of the export
 */
const processTypeFilter = async function (typefilterLookupEntry) {
  let queryArray = [];
  if (typefilterLookupEntry) {
    // throw  an error if we don't have the value set
    for (const propertyValue in typefilterLookupEntry) {
      let results = typefilterLookupEntry[propertyValue].map(async value => {
        let vs = await findOneResourceWithQuery({ url: value }, 'ValueSet');
        if (!vs) {
          throw new Error('Value set was not found in the database');
        }
        let vsResolved = getCodesFromValueSet(vs);

        vsResolved.forEach(code => {
          queryArray.push({ [`${propertyValue}.coding.code`]: code.code });
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
