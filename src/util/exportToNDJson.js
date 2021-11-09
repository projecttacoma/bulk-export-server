const { db } = require('./mongo');
const supportedResources = require('../util/supportedResources');
const fs = require('fs');
const path = require('path');

/**
 * Exports the list of resources included in the _type member of the request object to NDJson
 * if the _type member doesn't exist it will simply export everything included in the supportedResources list
 * @param {Object} request http request object
 * @param {*} clientId  an id to add to the file name so the client making the request can be tracked
 */
const exportToNDJson = async (clientId, request) => {
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
  let p = docs.map(async doc => {
    return writeToFile(doc.document, doc.collectionName, clientId);
  });
  await Promise.all(p);
};

const getDocuments = async (db, collectionName) => {
  const query = {};
  let doc = await db.collection(collectionName.toString()).find(query).toArray();
  return { document: doc, collectionName: collectionName.toString() };
};

const writeToFile = async (doc, type, clientId) => {
  let dirpath = './tmp/' + clientId;
  fs.mkdirSync(dirpath, { recursive: true });
  const filename = path.join(dirpath, `${type}.ndjson`);

  let lineCount = 0;
  fs.writeFileSync(filename, '');
  fs.open(filename, 'w', function (err) {
    if (err) throw err;
  });

  if (Object.keys(doc).length > 0) {
    doc.forEach(function (doc) {
      const result = JSON.parse(JSON.stringify(doc));
      fs.appendFileSync(filename, (++lineCount === 1 ? '' : '\r\n') + JSON.stringify(result));
    });
  } else return;
};

module.exports = { exportToNDJson };
