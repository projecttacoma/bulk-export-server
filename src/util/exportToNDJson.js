const mongoUtil = require('../util/mongo');
const supportedResources = require('../util/supportedResources');
const fs = require('fs');

const exportToNDJson = async clientId => {
  let dirpath = '/tmp/';
  await fs.promises.mkdir(dirpath, { recursive: true });
  supportedResources.foreach(async resourceType => {
    //make dir for the resource
    dirpath = dirpath + resourceType.toString();
    await fs.promises.mkdir(dirpath, { recursive: true });
    let collections = db.collection(resourceType);
    const filename = dirpath + resourceType + clientId + '.ndjson';
    collections.foreach(function (err, myResource) {
      let result = JSON.parse(JSON.stringify(myResource));
      fs.appendFileSync(dirpath, (++lineCount === 1 ? '' : '\r\n') + JSON.stringify(result));
    });
    fs.writeFileSync(filename, result);
  });
};

module.exports = { exportToNDJson };