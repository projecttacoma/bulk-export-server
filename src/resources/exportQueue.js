const Queue = require('bee-queue');
const { exportToNDJson } = require('../util/exportToNDJson');

const queueOptions = {
  removeOnSuccess: true
};

// Create a new queue to establish new Redis connection
const exportQueue = new Queue('export', queueOptions);

// This handler pulls down the jobs on Redis to handle
exportQueue.process(async job => {
  // Payload of createJob exists on job.data
  const { clientEntry, types } = job.data;
  // Call the existing export ndjson function that writes the files
  await exportToNDJson(clientEntry, types);
});

exportQueue.on('error', err => {
  console.log('queue error: ', err);
});

module.exports = exportQueue;
