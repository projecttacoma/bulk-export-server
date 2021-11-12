const fastify = require('fastify');

const { bulkExport } = require('../services/export.service');
const { checkBulkStatus } = require('../services/bulkstatus.service');
const { returnNDJsonContent } = require('../services/ndjson.service');

function build(opts = {}) {
  const app = fastify(opts);
  app.get('/$export', bulkExport);
  app.get('/bulkstatus/:clientId', checkBulkStatus);
  app.get('/:clientId/:fileName', returnNDJsonContent);
  return app;
}

module.exports = build;
