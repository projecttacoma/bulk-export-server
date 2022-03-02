const { addPendingBulkExportRequest } = require('../util/mongo.controller');
const supportedResources = require('../util/supportedResources');
const exportQueue = require('../resources/exportQueue');

/**
 * Exports data from a FHIR server.
 * @param {*} request the request object passed in by the user
 * @param {*} reply the response object
 */
const bulkExport = async (request, reply) => {
  if (validateExportParams(request, reply)) {
    request.log.info('Base >>> $export');
    const clientEntry = await addPendingBulkExportRequest();

    // Enqueue a new job into Redis for handling

    const job = {
      clientEntry: clientEntry,
      types: request.query._type,
      typeFilter: request.query._typeFilter
    };
    await exportQueue.createJob(job).save();
    reply
      .code(202)
      .header('Content-location', `http://${process.env.HOST}:${process.env.PORT}/bulkstatus/${clientEntry}`)
      .send();
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
    if (!['_outputFormat', '_type', '_typeFilter'].includes(param)) {
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
