const fs = require('fs');
const capabilityStatementResource = require('../config/capabilityStatementResource.json');

const generateCapabilityStatement = async (request, reply) => {
  request.log.info(`Metadata.generateCapabilityStatement`);

  reply.code(200);
  reply.send(capabilityStatementResource);
};

module.exports = { generateCapabilityStatement };
