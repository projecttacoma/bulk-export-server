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
  let requestTypes; 
  if (request.query._type) {
    requestTypes = request.query._type.split(','); //this is the list types to export
  } else {
    //create list of requested types if request.query._type param doesn't exist
    requestTypes.push(supportedResources);
  }

  let lineCount = 0;
  requestTypes.foreach(type => {
    dirpath = dirpath + type.toString();
    let collections = db.collection(type);
    const filename = dirpath + '/' + type + clientId + '.ndjson';
    collections.foreach(function (doc) {
      let result = JSON.parse(JSON.stringify(doc));
      fs.appendFileSync(dirpath, (++lineCount === 1 ? '' : '\r\n') + JSON.stringify(result));
    });
    fs.writeFileSync(filename);
  });
};

module.exports = { exportToNDJson };
