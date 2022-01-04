const { client } = require('../util/mongo.js');
const { exportToNDJson } = require('../util/exportToNDJson');
const Queue = require('bee-queue');

console.log(`export-worker-${process.pid}: Export Worker Started!`);

const exportQueue = new Queue('export', {
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: process.env.REDIS_PORT || 6379
  },
  removeOnSuccess: true
});

// This handler pulls down the jobs on Redis to handle
exportQueue.process(async job => {
  // Payload of createJob exists on job.data
  const { clientEntry, types } = job.data;
  await client.connect();
  // Call the existing export ndjson function that writes the files
  const result = await exportToNDJson(clientEntry, types);
  if (result) {
    console.log(`export-worker-${process.pid}: Completed Export Request: ${clientEntry}`);
  } else {
    console.log(`export-worker-${process.pid}: Failed Export Request: ${clientEntry}`);
  }
  await client.close();
});
