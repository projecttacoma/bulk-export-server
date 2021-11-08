const { db } = require('./mongo');
const supportedResources = require('../util/supportedResources');
const fs = require('fs');

/**
 * Exports the list of resources included in the _type member of the request object to NDJson
 * if the _type member doesn't exist it willl simply export everything included in the supportedResources list
 * @param {Object} request http request object
 * @param {*} clientId the response object
 */
const exportToNDJson = async (clientId, request) => {
  let dirpath = './tmp/';
  await fs.promises.mkdir(dirpath, { recursive: true });
  let requestTypes = [];
  if (request.query._type) {
    requestTypes = request.query._type.split(','); //this is the list types to export
  } else {
    //create list of requested types if request.query._type param doesn't exist
    requestTypes.push(supportedResources);
  }
  requestTypes.forEach(element => {
    getDocuments(db, element, writeToFile);
  });
};

const getDocuments = function (db, collectionName, writeToFile) {
  const query = {};
  db.collection(collectionName.toString())
    .find(query)
    .toArray(function (err, result) {
      if (err) throw err;
      writeToFile(result, collectionName);
    });
};

const writeToFile = function (result, collectionName) {
  let dirpath = './tmp/';
  dirpath = dirpath + collectionName.toString();
  const filename = dirpath + '/' + collectionName /*+ clientId */ + '.ndjson';
  console.log('file name should be:' + filename);
  let lineCount = 0;
  var stream = fs.createWriteStream(filename, {flags:'a'});
  result.forEach(function (doc) {
    let result = JSON.parse(JSON.stringify(doc));
    stream.write((++lineCount === 1 ? '' : '\r\n') + JSON.stringify(result));
  });
  stream.end();
};

module.exports = { exportToNDJson };
