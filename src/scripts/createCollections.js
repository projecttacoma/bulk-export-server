const mongoUtil = require('../util/mongo');
const supportedResources = require('../util/supportedResources');
const { ensureIndexesForResource } = require('../util/mongoIndexes');

async function main() {
  // Use connect method to connect to the server
  await mongoUtil.client.connect();
  console.log('Connected successfully to server');

  const creations = supportedResources.map(async resourceType => {
    const collection = await mongoUtil.db.createCollection(resourceType);
    const results = await ensureIndexesForResource(collection, resourceType);
    const failures = results.filter(result => result.error);
    failures.forEach(failure => {
      console.error(`Failed to create index ${failure.name} on ${resourceType}: ${failure.error.message}`);
    });
    if (failures.length > 0) {
      throw new Error(`Failed to create ${failures.length} indexes on ${resourceType}`);
    }
    console.log('Created collection', resourceType);
  });

  await Promise.all(creations);
  return 'done.';
}

main()
  .then(console.log)
  .catch(console.error)
  .finally(() => mongoUtil.client.close());
