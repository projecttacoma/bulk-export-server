// Setup for import queue which pushes jobs to Redis

const Queue = require('bee-queue');

const queueOptions = {
  removeOnSuccess: true,
  isWorker: false
};

// Create a new queue to establish new Redis connection
const exportQueue = new Queue('export', queueOptions);

exportQueue.on('error', err => {
  console.log('queue error: ', err);
});

module.exports = exportQueue;
