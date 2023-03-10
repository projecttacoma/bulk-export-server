const fastify = require('fastify');

const { bulkExport, patientBulkExport, groupBulkExport } = require('../services/export.service');
const { checkBulkStatus } = require('../services/bulkstatus.service');
const { returnNDJsonContent } = require('../services/ndjson.service');
const { groupSearchById, groupSearch, groupCreate, groupUpdate } = require('../services/group.service');
const { uploadTransactionBundle } = require('../services/bundle.service');

// set bodyLimit to 50mb
function build(opts) {
  const app = fastify({ ...opts, bodyLimit: 50 * 1024 * 1024 });
  app.get('/$export', bulkExport);
  app.get('/Patient/$export', patientBulkExport);
  app.get('/Group/:groupId/$export', groupBulkExport);
  app.get('/bulkstatus/:clientId', checkBulkStatus);
  app.get('/:clientId/:fileName', returnNDJsonContent);
  app.get('/Group/:groupId', groupSearchById);
  app.get('/Group', groupSearch);
  app.post('/Group', groupCreate);
  app.put('/Group/:groupId', groupUpdate);
  app.post('/', uploadTransactionBundle);
  return app;
}

module.exports = build;
