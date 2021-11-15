const { getBulkExportStatus, BULKSTATUS_COMPLETED, BULKSTATUS_INPROGRESS } = require('../util/mongo.controller');
const fs = require('fs');
const path = require('path');

/**
 * Checks the status of the bulk export request.
 * @param {*} request the request object passed in by the user
 * @param {*} reply the response object
 */
async function checkBulkStatus(request, reply) {
  const clientId = request.params.clientId;
  const bulkStatus = await getBulkExportStatus(clientId);

  if (!bulkStatus) {
    reply.code(404).send(new Error(`Could not find bulk export request with id: ${clientId}`));
  }
  if (bulkStatus.status === BULKSTATUS_INPROGRESS) {
    reply.code(202).header('X-Progress', 'Exporting files').header('Retry-After', 120).send();
  } else if (bulkStatus.status === BULKSTATUS_COMPLETED) {
    reply.code(200).header('Expires', 'EXAMPLE_EXPIRATION_DATE');
    const responseData = await getNDJsonURLs(reply, clientId);
    reply.send({
      transactionTime: new Date(),
      requiresAccessToken: false,
      outcome: responseData
    });
  } else {
    reply.send(
      new Error(bulkStatus.error.message || `An unknown error occurred during bulk export with id: ${clientId}`)
    );
  }
}

/**
 * Gathers the ndjson URLs for all the desired resources for
 * the specified clientId.
 * @param {string} clientId client Id from request params
 * @param {*} reply the response object
 * @returns object of all the types and corresponding URLs to
 * the ndjson content
 */
async function getNDJsonURLs(reply, clientId) {
  let files;
  try {
    files = fs.readdirSync(`tmp/${clientId}`);
  } catch (e) {
    reply.send(
      new Error(e.message || `An error occurred when trying to retrieve files from the ${clientId} directory`)
    );
  }
  const output = [];
  files.forEach(file => {
    const entry = {
      type: path.basename(file, '.ndjson'),
      url: `http://${process.env.HOST}:${process.env.PORT}/${clientId}/${file}`
    };
    output.push(entry);
  });
  return output;
}

module.exports = { checkBulkStatus };
