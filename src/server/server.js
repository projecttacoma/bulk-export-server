//const fastify = require("fastify")({ logger: true });
// const bulkstatus = require("../services/bulkstatus.service");
// const { bulkExport } = require("../services/export.service");
const mongoUtil = require("../util/mongo");

// Declare export route
// fastify.get("/$export", bulkExport);

// // Declare bulkstatus route
// fastify.get("/bulkstatus/:clientId", bulkstatus.checkBulkStatus);

// Run the server!

const server = require("./app")({ logger: true });

const start = async () => {
  try {
    await server.listen(3000);
    await mongoUtil.client.connect();
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
};
start();
