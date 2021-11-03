


const exportToNDJson = async clientId => {
  let dirpath = '/tmp/';
  await fs.promises.mkdir(dirpath, { recursive: true });
  supportedResources.map(async resourceType => {
    //make dir for the resource
    dirpath = dirpath + resourceType.toString();
    await fs.promises.mkdir(dirpath, { recursive: true });
    //get a collection
    const filename = dirpath + resourceType + clientId + '.json';
    db.resourceType.foreach(function (err, myResource) {
      let result = JSON.parse(JSON.stringify(myResource));
      fs.appendFileSync(dirpath, (++lineCount === 1 ? '' : '\r\n') + JSON.stringify(result));
    });
    fs.writeFileSync(filename, result);
  });
};