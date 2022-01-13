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
      return getDocuments(db, element);
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
 * Retrieves all documents from the requested collection and wraps in an object with the collection name
 * @param {Object} db The mongo db that contains the requested data
 * @param {string} collectionName The collection of interest in the mongo db
 * @returns {Object} An object containing all data from the given collection name as well as the collection name
 */
const getDocuments = async (db, collectionName) => {
  const query = {};
  let doc = await db
    .collection(collectionName.toString())
    .find(query, { projection: { _id: 0 } })
    .toArray();
  return { document: doc, collectionName: collectionName.toString() };
};

/**
 * Writed the contents of a mongo document to an ndjson file with the appropriate resource
 * name, stored in a directory under the clients id
 * @param {Object} doc A mongodb document containing fhir resources
 * @param {string} type The fhir resource type contained in the mongo document
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

module.exports = { exportToNDJson };
