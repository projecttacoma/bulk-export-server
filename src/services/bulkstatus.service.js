const { getBulkExportStatus } = require("../util/mongo.controller");

/**
 * Checks the status of the bulk export request.
 * @param {*} request the request object passed in by the user
 * @param {*} reply the response object
 */
async function checkBulkStatus(request, reply) {
  const clientId = request.params.clientId;
  const bulkStatus = await getBulkExportStatus(clientId);

  if (!bulkStatus) {
    reply
      .code(404)
      .send(
        new Error(`Could not find bulk export request with id: ${clientId}`)
      );
  }
  if (bulkStatus.status === "In Progress") {
    reply
      .code(202)
      .header("X-Progress", "Exporting files")
      .header("Retry-After", 120)
      .send();
  } else if (bulkStatus.status === "Completed") {
    reply.code(200).header("Expires", "EXAMPLE_EXPIRATION_DATE");
    //TODO: Fill all this in with actual response data. Example data for now.
    reply.send({
      transactionTime: "2021-01-01T00:00:00Z",
      requiresAccessToken: true,
      outcome: [
        {
          type: "OperationOutcome",
          url: "https://example.com/output/info_file_1.ndjson",
        },
      ],
      extension: { "https://example.com/extra-property": true },
    });
  } else {
    reply.send(
      new Error(
        bulkStatus.error.message ||
          `An unknown error occurred during bulk export with id: ${clientId}`
      )
    );
  }
}

module.exports = { checkBulkStatus };
