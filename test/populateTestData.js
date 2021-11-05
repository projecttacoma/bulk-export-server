const { db, client } = require('../src/util/mongo');
const testStatuses = require('./fixtures/testBulkStatus.json');

const createTestResource = async (data, resourceType) => {
  const collection = db.collection(resourceType);
  await collection.insertOne(data);
  return { id: data.id };
};

//clean up db after test
async function cleanUpDb() {
  await db.dropDatabase();
  await client.close();
}

const bulkStatusSetup = async () => {
  await client.connect();
  const promises = testStatuses.map(async status => {
    await createTestResource(status, 'bulkExportStatuses');
  });
  await Promise.all(promises);
};
module.exports = { bulkStatusSetup, cleanUpDb, createTestResource };
