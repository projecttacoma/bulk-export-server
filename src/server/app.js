const fastify = require("fastify");
const { bulkExport } = require("../services/export.service");
const { checkBulkStatus } = require("../services/bulkstatus.service");

function build(opts = {}) {
  const app = fastify(opts);
  app.get("/$export", bulkExport);
  app.get("/bulkstatus/:clientId", checkBulkStatus);
  return app;
}

module.exports = build;
