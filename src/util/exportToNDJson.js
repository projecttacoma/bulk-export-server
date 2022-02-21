const { db } = require('./mongo');
const supportedResources = require('./supportedResources');
const fs = require('fs');
const path = require('path');
const { updateBulkExportStatus, BULKSTATUS_COMPLETED, BUlKSTATUS_FAILED } = require('./mongo.controller');

/**
 * Exports the list of resources included in the _type member of the request object to NDJson
 * if the _type member doesn't exist it will simply export everything included in the supportedResources list
 * @param {string} clientId  an id to add to the file name so the client making the request can be tracked
 * @param {Array} types Array of types to be queried for, retrieved from request params
 */
const exportToNDJson = async (clientId, types) => {
  try {
    let dirpath = './tmp/';
    fs.mkdirSync(dirpath, { recursive: true });
    let requestTypes = [];
    if (types) {
      requestTypes = types.split(','); //this is the list types to export
    } else {
      //create list of requested types if request.query._type param doesn't exist
      requestTypes.push(...supportedResources);
    }
    let docs = requestTypes.map(async element => {
      if (element != 'ValueSet') {
        return getDocuments(db, element, types);
      }
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
    await updateBulkExportStatus(clientId, BUlKSTATUS_FAILED, { message: e.message, code: 500 });
    return false;
  }
};

/**
 * Retrieves all documents from the requested collection and wraps them in an object with the collection name
 * @param {Object} db The mongodb that contains the requested data
 * @param {string} collectionName The collection of interest in the mongodb
 * @returns {Object} An object containing all data from the given collection name as well as the collection name
 */
const getDocuments = async (db, collectionName, types) => {
  const query = {};
  let doc =""
  if(!types){
   doc = await db
    .collection(collectionName.toString())
    .find(query, { projection: { _id: 0 } })
    .toArray();
  } else {
    doc = await db
    .collection(collectionName.toString())
    .find(processTypeFilter(types), { projection: { _id: 0 } })
    .toArray();
  }
  return { document: doc, collectionName: collectionName.toString() };
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

const processTypeFilter = function (types) {
  let queryArray = [];
  let codes = [];
  //process type filter and see the
  // parse string it will look someting like:
  //code: ..vsUrl split this array on commas

  //now check if the code is contained in the valueset
  if (types) {
    //parse out the typefilter and push the values onto an array/query ob
    const typefilter = request.param._typefilter.split(',');
    //now parse that string and pass it into fucntion for vs expansion
    typefilter.map(async value => {
      vs = value.split('?');
      codes.push(getHierarchicalCodes(vs));
    });
  }
  codes.map(async code => {
    queryArray.push({ 'code.coding.code': code });
  });

  console.log(queryArray);

  let query = {
    $or: queryArray
  };
  return query;
};

module.exports = { exportToNDJson };
