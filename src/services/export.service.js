const { addPendingBulkExportRequest, findResourceById } = require('../util/mongo.controller');
const supportedResources = require('../util/supportedResources');
const exportQueue = require('../resources/exportQueue');
const patientResourceTypes = require('../compartment-definition/patientExportResourceTypes.json');
const { createOperationOutcome } = require('../util/errorUtils');

/**
 * Exports data from a FHIR server, whether or not it is associated with a patient.
 * @param {Object} request the request object passed in by the user
 * @param {Object} reply the response object
 */
const bulkExport = async (request, reply) => {
  if (validateExportParams(request, reply)) {
    request.log.info('Base >>> $export');
    const clientEntry = await addPendingBulkExportRequest();

    let types;
    if (request.query._type) {
      types = request.query._type.split(',');
    }

    // Enqueue a new job into Redis for handling
    const job = {
      clientEntry: clientEntry,
      types: types,
      typeFilter: request.query._typeFilter,
      systemLevelExport: true
    };
    await exportQueue.createJob(job).save();
    reply
      .code(202)
      .header('Content-location', `http://${process.env.HOST}:${process.env.PORT}/bulkstatus/${clientEntry}`)
      .send();
  }
};

/**
 * Exports data from a FHIR server for resource types pertaining to all patients. Uses parsed patient
 * compartment definition as a point of reference for recommended resources to be returned.
 * @param {Object} request the request object passed in by the user
 * @param {Object} reply the response object
 */
const patientBulkExport = async (request, reply) => {
  if (validateExportParams(request, reply)) {
    request.log.info('Patient >>> $export');
    const clientEntry = await addPendingBulkExportRequest();

    let types;
    if (request.query._type) {
      types = filterPatientResourceTypes(request, reply);
    } else {
      types = patientResourceTypes;
    }

    // Enqueue a new job into Redis for handling
    const job = {
      clientEntry: clientEntry,
      types: types,
      typeFilter: request.query._typeFilter,
      systemLevelExport: false
    };
    await exportQueue.createJob(job).save();
    reply
      .code(202)
      .header('Content-location', `http://${process.env.HOST}:${process.env.PORT}/bulkstatus/${clientEntry}`)
      .send();
  }
};

/**
 * Exports data from a FHIR server for resource types pertaining to patients found in the referenced
 * Group. Uses parsed patient compartment definition similarly to patientBulkExport.
 * @param {Object} request the request object passed in by the user
 * @param {Object} reply the response object
 */
const groupBulkExport = async (request, reply) => {
  if (validateExportParams(request, reply)) {
    request.log.info('Group >>> $export');
    const group = await findResourceById(request.params.groupId, 'Group');
    if (!group) {
      reply.code(404).send(new Error(`The requested group ${request.params.groupId} was not found.`));
      return;
    }
    const patientIds = group.member.map(m => {
      const splitRef = m.entity.reference.split('/');
      return splitRef[splitRef.length - 1];
    });

    const clientEntry = await addPendingBulkExportRequest();

    let types;
    if (request.query._type) {
      types = filterPatientResourceTypes(request, reply);
    } else {
      types = patientResourceTypes;
    }

    // Enqueue a new job into Redis for handling
    const job = {
      clientEntry: clientEntry,
      types: types,
      typeFilter: request.query._typeFilter,
      systemLevelExport: false,
      patientIds: patientIds
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
    const unsupportedTypes = [];
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

  if (request.query._typeFilter) {
    const typeFilterArray = request.query._typeFilter.split(',');
    const unsupportedTypeFilterTypes = [];
    typeFilterArray.forEach(line => {
      const resourceType = line.substring(0, line.indexOf('?'));
      // consider the query "unsupported" if no resource type is provided in query
      if (!resourceType) {
        unsupportedTypeFilterTypes.push(line);
      } else if (!supportedResources.includes(resourceType)) {
        unsupportedTypeFilterTypes.push(resourceType);
      }
    });
    if (unsupportedTypeFilterTypes.length > 0) {
      reply
        .code(400)
        .send(
          new Error(
            `The following resourceTypes are not supported for _typeFilter param for $export: ${unsupportedTypeFilterTypes.join(
              ', '
            )}.`
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

/**
 * Checks provided types against the recommended resource types for patient-level export.
 * Filters resource types that do not appear in the patient compartment definition and throws
 * OperationOutcome if none of the provided types are present in the patient compartment definition.
 * @param {Object} request http request object
 * @param {Object} reply the response object
 * @return array of resource types to use as reference for export after filtering out types that
 * are not permitted for patient-level export
 */
function filterPatientResourceTypes(request, reply) {
  const types = request.query._type.split(',');
  // check types against patient compartment definition and filter
  const filteredTypes = types.filter(type => patientResourceTypes.includes(type));
  if (types.length !== filteredTypes.length) {
    if (filteredTypes.length === 0) {
      reply.code(400).send(
        createOperationOutcome('None of the provided resource types are permitted for Patient/Group export.', {
          issueCode: 400,
          severity: 'error'
        })
      );
    }
    const removedTypes = types.filter(type => !filteredTypes.includes(type));
    request.log.warn(
      `The following resource types were removed from the request because they are not permitted for Patient/Group export: ${removedTypes.join(
        ', '
      )}`
    );
  }
  return filteredTypes;
}

module.exports = { bulkExport, patientBulkExport, groupBulkExport };
