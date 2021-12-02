// Generate fake export queue for testing
const Queue = require('bee-queue');

const jobQueue = new Queue('export');

// Mock exportToNDJson() function for testing
const exportToNDJson = async data => {
  return data;
};

// Mock bulkExport() function for testing
const bulkExport = async () => {
  const job = jobQueue.createJob({ x: 2, y: 3 });
  await job.save();
};

jobQueue.process(async job => {
  const d = await exportToNDJson(job.data);
  return d;
});

module.exports = {
  bulkExport,
  jobQueue,
  exportToNDJson
};
