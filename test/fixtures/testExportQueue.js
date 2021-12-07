// Generate fake export queue for testing
const Queue = require('bee-queue');

const testExportQueue = new Queue('export');

// Mock exportToNDJson() function for testing
const exportToNDJson = async data => {
  return data;
};

// Mock bulkExport() function for testing
const bulkExport = async () => {
  const job = testExportQueue.createJob({ clientEntry: 'testId', type: 'test' });
  await job.save();
};

testExportQueue.process(async job => {
  const d = await exportToNDJson(job.data);
  return d;
});

module.exports = {
  bulkExport,
  testExportQueue,
  exportToNDJson
};
