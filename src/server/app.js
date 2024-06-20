const fastify = require('fastify');
const cors = require('@fastify/cors');

const { bulkExport, patientBulkExport, groupBulkExport } = require('../services/export.service');
const { checkBulkStatus, kickoffImport } = require('../services/bulkstatus.service');
const { returnNDJsonContent } = require('../services/ndjson.service');
const { groupSearchById, groupSearch, groupCreate, groupUpdate } = require('../services/group.service');
const { uploadTransactionOrBatchBundle } = require('../services/bundle.service');
const { generateCapabilityStatement } = require('../services/metadata.service');

// set bodyLimit to 50mb
function build(opts) {
  const app = fastify({ ...opts, bodyLimit: 50 * 1024 * 1024 });
  app.register(cors, { exposedHeaders: ['content-location', 'expires', 'x-progress', 'retry-after'] });
  app.get('/metadata', generateCapabilityStatement);
  app.get('/$export', bulkExport);
  app.post('/$export', bulkExport);
  app.get('/Patient/$export', patientBulkExport);
  app.post('/Patient/$export', patientBulkExport);
  app.get('/Group/:groupId/$export', groupBulkExport);
  app.post('/Group/:groupId/$export', groupBulkExport);
  app.get('/bulkstatus/:clientId/kickoff-import', kickoffImport);
  app.get('/bulkstatus/:clientId', checkBulkStatus);
  app.get('/:clientId/:fileName', returnNDJsonContent);
  app.get('/Group/:groupId', groupSearchById);
  app.get('/Group', groupSearch);
  app.post('/Group', groupCreate);
  app.put('/Group/:groupId', groupUpdate);
  app.post('/', uploadTransactionOrBatchBundle);
  return app;
}

module.exports = build;
