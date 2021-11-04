const { db } = require('./mongo');
const supportedResources = require('../util/supportedResources');
const fs = require('fs');

const exportToNDJson = async (clientId, request) => {
  let dirpath = './tmp/';
  await fs.promises.mkdir(dirpath, { recursive: true });
  //create list of requested types if request.query._types param exists
  if (request.query._types) {
    let lineCount = 0;
    const requestTypes = request.query._type.split(','); //this is the list types to export
    requestTypes.foreach(type => {
      dirpath = dirpath + type.toString();
      let collections = db.collection(type);
      const filename = dirpath +'/'+ type + clientId + '.ndjson';
      collections.foreach(function (doc) {
        let result = JSON.parse(JSON.stringify(doc));
        fs.appendFileSync(dirpath, (++lineCount === 1 ? '' : '\r\n') + JSON.stringify(result));
      });
      fs.writeFileSync(filename);
    });
  } else {
    let lineCount = 0;
    supportedResources.foreach(async resourceType => {
      //make dir for the resource
      dirpath = dirpath + resourceType.toString();
      await fs.promises.mkdir(dirpath, { recursive: true });
      let collections = db.collection(resourceType);
      const filename = dirpath  +'/'+ resourceType + clientId + '.ndjson';
      collections.foreach(function (myResource) {
        fs.appendFileSync(
          dirpath,
          (++lineCount === 1 ? '' : '\r\n') + JSON.stringify(JSON.parse(JSON.stringify(myResource)))
        );
      });
      fs.writeFileSync(filename);
    });
  }
};

module.exports = { exportToNDJson };
