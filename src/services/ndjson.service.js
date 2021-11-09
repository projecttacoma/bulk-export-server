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
  const readStream = fs.createReadStream(`tmp/${clientId}/${url}`);

  readStream.on('data', function (text) {
    reply.send(text);
  });
};

module.exports = { returnNDJsonContent };
