const { db } = require('./mongo');
const supportedResources = require('./supportedResources');
const fs = require('fs');
const path = require('path');
const { updateBulkExportStatus, BULKSTATUS_COMPLETED, BUlKSTATUS_FAILED } = require('./mongo.controller');

/**
 * Exports the list of resources included in the _type member of the request object to NDJson
 * if the _type member doesn't exist it will simply export everything included in the supportedResources list
 * @param {string} clientId  an id to add to the file name so the client making the request can be tracked
 * @param {Object} request http request object
 */
const exportToNDJson = async (clientId, request) => {
  try {
    let dirpath = './tmp/';
    fs.mkdirSync(dirpath, { recursive: true });
    let requestTypes = [];
    if (request.query._type) {
      requestTypes = request.query._type.split(','); //this is the list types to export
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

    // TODO: if we want to catch and report any warnings, push them to the
    // bulkstatus warning array when they occur, then use the createOperationOutcome
    // function here to convert the error object into an OperationOutcome and write
    // it to a file

    // mark bulk status job as complete after all files have been written
    await updateBulkExportStatus(clientId, BULKSTATUS_COMPLETED);
  } catch (e) {
    await updateBulkExportStatus(clientId, BUlKSTATUS_FAILED, { message: e.message, code: 500 });
  }
};

const getDocuments = async (db, collectionName) => {
  const query = {};
  let doc = await db.collection(collectionName.toString()).find(query).toArray();
  return { document: doc, collectionName: collectionName.toString() };
};

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
