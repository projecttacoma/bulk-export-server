const mongoUtil = require('../util/mongo');
const { ensureCollectDataIndexes } = require('../util/mongoIndexes');

async function main() {
  await mongoUtil.client.connect();
  console.log('Connected successfully to server');

  const results = await ensureCollectDataIndexes(mongoUtil.db, { allowNonUniqueIdFallback: true });
  const failures = results.filter(result => result.error);
  const fallbacks = results.filter(result => result.fallback);
  const successfulIndexes = results.length - failures.length;

  failures.forEach(failure => {
    console.error(`Failed to create index ${failure.name} on ${failure.resourceType}: ${failure.error.message}`);
  });

  if (failures.length > 0) {
    process.exitCode = 1;
  }

  return `Created or verified ${successfulIndexes} indexes. ${fallbacks.length} used non-unique id fallback. ${failures.length} failures.`;
}

main()
  .then(console.log)
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => mongoUtil.client.close());
