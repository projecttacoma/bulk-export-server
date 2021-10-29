const fastify = require('fastify');
const { bulkExport } = require('../services/export.service');
const { checkBulkStatus } = require('../services/bulkstatus.service');

function build() {
  const app = fastify();
  app.get('/$export', bulkExport);
  app.get('/bulkstatus/:clientId', checkBulkStatus);
  return app;
}

module.exports = build;
