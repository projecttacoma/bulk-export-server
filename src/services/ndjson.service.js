const fs = require('fs');

/**
 * Retrieves ndjson content from the specified url and returns it in the
 * response.
 * @param {*} request the request object passed in by the user
 * @param {*} reply the response object
 */
const returnNDJsonContent = async (request, reply) => {
  request.log.info('Base >>> return NDJSON');
  const clientId = request.params.clientId;
  const url = request.params.fileName;
  const filePath = `tmp/${clientId}/${url}`;
  if (fs.existsSync(filePath)) {
    const readStream = fs.createReadStream(`tmp/${clientId}/${url}`);
    reply.header('Content-type', 'application/ndjson+fhir');
    return reply.send(readStream);
  } else {
    reply.code(404).send(new Error(`The following file path was not found: ${filePath}`));
  }
};

module.exports = { returnNDJsonContent };
