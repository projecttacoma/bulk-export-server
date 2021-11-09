const { exportToNDJson } = require('../util/exportToNDJson');
const {
  addPendingBulkExportRequest,
  updateBulkExportStatus,
  BULKSTATUS_COMPLETED
} = require('../util/mongo.controller');
const supportedResources = require('../util/supportedResources');

/**
 * Exports data from a FHIR server.
 * @param {*} request the request object passed in by the user
 * @param {*} reply the response object
 */
const bulkExport = async (request, reply) => {
  if (validateExportParams(request, reply)) {
    request.log.info('Base >>> $export');
    const clientEntry = await addPendingBulkExportRequest();
    exportToNDJson(clientEntry, request);
    reply.code(202).header('Content-location', `/bulkstatus/${clientEntry}`).send();
    updateBulkExportStatus(clientEntry, BULKSTATUS_COMPLETED);
  }
};

/**
 * Checks that the parameters input to $export are valid. Returns true if all the
 * export params are valid, meaning no errors were thrown in the process.
 * @param {Object} request http request object
 * @param {*} reply the response object
 */
function validateExportParams(request, reply) {
  /**
   * According to http://hl7.org/fhir/async.html, we should also
   * account for abbreviated representations of ndjson
   */
  const ACCEPTEDOUTPUTFORMATS = ['application/fhir+ndjson', 'application/ndjson+fhir', 'application/ndjson', 'ndjson'];
  if (request.query._outputFormat) {
    if (!ACCEPTEDOUTPUTFORMATS.includes(request.query._outputFormat)) {
      reply
        .code(400)
        .send(
          new Error(
            `The following output format is not supported for _outputFormat param for $export: ${request.query._outputFormat}`
          )
        );
      return false;
    }
  }

  if (request.query._type) {
    // type filter is comma-delimited
    const requestTypes = request.query._type.split(',');
    let unsupportedTypes = [];
    requestTypes.forEach(type => {
      if (!supportedResources.includes(type)) {
        unsupportedTypes.push(type);
      }
    });
    if (unsupportedTypes.length > 0) {
      reply
        .code(400)
        .send(
          new Error(
            `The following resourceTypes are not supported for _type param for $export: ${unsupportedTypes.join(', ')}.`
          )
        );
      return false;
    }
  }

  let unrecognizedParams = [];
  Object.keys(request.query).forEach(param => {
    if (!['_outputFormat', '_type'].includes(param)) {
      unrecognizedParams.push(param);
    }
  });
  if (unrecognizedParams.length > 0) {
    reply
      .code(400)
      .send(new Error(`The following parameters are unrecognized by the server: ${unrecognizedParams.join(', ')}.`));
    return false;
  }
  return true;
}

module.exports = { bulkExport };
