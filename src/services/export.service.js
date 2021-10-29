const { addPendingBulkExportRequest } = require("../util/mongo.controller");
const supportedResources = require("../util/supportedResources");

/**
 * Exports data from a FHIR server.
 * @param {*} request the request object passed in by the user
 * @param {*} reply the response object
 */
const bulkExport = async (request, reply) => {
  request.log.info("Base >>> $export");

  const clientEntry = await addPendingBulkExportRequest();

  validateExportParams(request, reply);

  reply
    .code(202)
    .header("Content-location", `/bulkstatus/${clientEntry}`)
    .send();
};

/**
 * Checks that the parameters input to $export are valid.
 * @param {Object} request http request object
 * @param {*} reply the response object
 */
function validateExportParams(request, reply) {
  /**
   * According to http://hl7.org/fhir/async.html, we should also
   * account for abbreviated representations of ndjson
   */
  const ACCEPTEDOUTPUTFORMATS = [
    "application/fhir+ndjson",
    "application/ndjson",
    "ndjson",
  ];
  if (request.query._outputFormat) {
    if (!ACCEPTEDOUTPUTFORMATS.includes(request.query._outputFormat)) {
      reply
        .code(400)
        .send(
          new Error(
            `The following output format is not supported for _outputFormat param for $export: ${request.query._outputFormat}`
          )
        );
    }
  }

  if (request.query._type) {
    // type filter is comma-delimited
    const types = request.query._type.split(",");

    types.forEach((type) => {
      if (!supportedResources.includes(type)) {
        reply
          .code(400)
          .send(
            new Error(
              `The following resourceType is not supported for _type param for $export: ${type}`
            )
          );
      }
    });
  }

  if (request.query._since) {
    reply
      .code(400)
      .send(new Error(`The _since parameter is not yet supported for $export`));
  }

  let unrecognizedParams = [];
  Object.keys(request.query).forEach((param) => {
    if (!["_outputFormat", "_type"].includes(param)) {
      unrecognizedParams.push(param);
    }
  });
  if (unrecognizedParams.length > 0) {
    reply
      .code(400)
      .send(
        new Error(
          `The following parameters are unrecognized by the server: ${unrecognizedParams.join(
            ", "
          )}.`
        )
      );
  }
}

module.exports = { bulkExport };
