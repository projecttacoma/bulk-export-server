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
  console.log(`export-worker-${process.pid}: Processing Request: ${job.data.clientEntry}`);
  await client.connect();
  // Call the existing export ndjson function that writes the files

  // Payload of createJob exists on job.data
  const result = await exportToNDJson(job.data);
  if (result) {
    console.log(`export-worker-${process.pid}: Completed Export Request: ${job.data.clientEntry}`);
  } else {
    console.log(`export-worker-${process.pid}: Failed Export Request: ${job.data.clientEntry}`);
  }
  await client.close();
});
