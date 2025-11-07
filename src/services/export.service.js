const { addPendingBulkExportRequest, findResourceById } = require('../util/mongo.controller');
const supportedResources = require('../util/supportedResources').filter(r => r !== 'ValueSet'); //exclude ValueSet (may be stored but not exported)
const exportQueue = require('../resources/exportQueue');
const { patientAttributePaths } = require('fhir-spec-tools/build/data/patient-attribute-paths');
const patientResourceTypes = Object.keys(patientAttributePaths);
const { createOperationOutcome } = require('../util/errorUtils');
const { verifyPatientsInGroup, actualizeGroup } = require('../util/groupUtils');
const { gatherParams } = require('../util/serviceUtils');

/**
 * Exports data from a FHIR server, whether or not it is associated with a patient.
 * @param {Object} request the request object passed in by the user
 * @param {Object} reply the response object
 */
const bulkExport = async (request, reply) => {
  const parameters = gatherParams(request.method, request.query, request.body, reply);
  if (parameters.patient) {
    reply.code(400).send(
      createOperationOutcome('The "patient" parameter cannot be used in a system-level export request.', {
        issueCode: 400,
        severity: 'error'
      })
    );
  }
  if (validateExportParams(parameters, reply)) {
    request.log.info('Base >>> $export');
    const fullURL = `${request.protocol}://${request.hostname}${request.originalUrl}`;
    const clientEntry = await addPendingBulkExportRequest(parameters.organizeOutputBy === 'Patient', fullURL);

    let types = request.query._type?.split(',') || parameters._type?.split(',');
    // if parameters.organizeOutputBy=Patient, then we want to pre filter the types that could
    // have patient references like we do for Patient level export
    if (parameters.organizeOutputBy === 'Patient') {
      if (types) {
        types = filterPatientResourceTypes(request, reply, types);
      } else {
        types = patientResourceTypes;
      }
    }

    const elements = parameters._elements?.split(',');

    // Enqueue a new job into Redis for handling
    const job = {
      clientEntry: clientEntry,
      types: types,
      typeFilter: request.query._typeFilter,
      systemLevelExport: true,
      elements: elements,
      byPatient: parameters.organizeOutputBy === 'Patient'
    };
    await exportQueue.createJob(job).save();
    reply.code(202).header('Content-location', `${process.env.BULK_BASE_URL}/bulkstatus/${clientEntry}`).send();
  }
};

/**
 * Exports data from a FHIR server for resource types pertaining to all patients. Uses parsed patient
 * compartment definition as a point of reference for recommended resources to be returned.
 * @param {Object} request the request object passed in by the user
 * @param {Object} reply the response object
 */
const patientBulkExport = async (request, reply) => {
  if (request.query && request.query.patient) {
    reply
      .code(400)
      .send(
        new Error(
          'The "patient" parameter cannot be used in the query of a GET request. The parameter must be specified in a POST request only.'
        )
      );
  }
  const parameters = gatherParams(request.method, request.query, request.body, reply);
  if (validateExportParams(parameters, reply)) {
    if (parameters.patient) {
      // validate patients are available on the server
      await validatePatientReferences(parameters.patient, reply);
    }
    request.log.info('Patient >>> $export');
    const fullURL = `${request.protocol}://${request.hostname}${request.originalUrl}`;
    const clientEntry = await addPendingBulkExportRequest(parameters.organizeOutputBy === 'Patient', fullURL);

    let types = request.query._type?.split(',') || parameters._type?.split(',');
    if (types) {
      types = filterPatientResourceTypes(request, reply, types);
    } else {
      types = patientResourceTypes;
    }

    const elements = request.query._elements?.split(',') || parameters._elements?.split(',');

    // Enqueue a new job into Redis for handling
    const job = {
      clientEntry: clientEntry,
      types: types,
      typeFilter: parameters._typeFilter,
      patient: parameters.patient,
      systemLevelExport: false,
      elements: elements,
      byPatient: parameters.organizeOutputBy === 'Patient'
    };
    await exportQueue.createJob(job).save();
    reply.code(202).header('Content-location', `${process.env.BULK_BASE_URL}/bulkstatus/${clientEntry}`).send();
  }
};

/**
 * Exports data from a FHIR server for resource types pertaining to patients found in the referenced
 * Group. Uses parsed patient compartment definition similarly to patientBulkExport.
 * @param {Object} request the request object passed in by the user
 * @param {Object} reply the response object
 */
const groupBulkExport = async (request, reply) => {
  if (request.query && request.query.patient) {
    reply
      .code(400)
      .send(
        new Error(
          'The "patient" parameter cannot be used in the query of a GET request. The parameter must be specified in a POST request only.'
        )
      );
  }
  const parameters = gatherParams(request.method, request.query, request.body, reply);
  if (validateExportParams(parameters, reply)) {
    request.log.info('Group >>> $export');
    const group = await findResourceById(request.params.groupId, 'Group');
    if (!group) {
      reply.code(404).send(new Error(`The requested group ${request.params.groupId} was not found.`));
      return;
    }
    let members;
    if (!group.actual) {
      members = await actualizeGroup(group);
    } else {
      members = group.member.map(m => m.entity.reference);
    }

    if (parameters.patient) {
      verifyPatientsInGroup(parameters.patient, group.id, members, reply);
    }
    const patientIds = members.map(m => {
      const splitRef = m.split('/');
      return splitRef[splitRef.length - 1];
    });

    const fullURL = `${request.protocol}://${request.hostname}${request.originalUrl}`;
    const clientEntry = await addPendingBulkExportRequest(parameters.organizeOutputBy === 'Patient', fullURL);
    let types = request.query._type?.split(',') || parameters._type?.split(',');
    if (types) {
      types = filterPatientResourceTypes(request, reply, types);
    } else {
      types = patientResourceTypes;
    }

    const elements = request.query._elements?.split(',') || parameters._elements?.split(',');

    // Enqueue a new job into Redis for handling
    const job = {
      clientEntry: clientEntry,
      types: types,
      typeFilter: parameters._typeFilter,
      patient: parameters.patient,
      systemLevelExport: false,
      patientIds: patientIds,
      elements: elements,
      byPatient: parameters.organizeOutputBy === 'Patient'
    };
    await exportQueue.createJob(job).save();
    reply.code(202).header('Content-location', `${process.env.BULK_BASE_URL}/bulkstatus/${clientEntry}`).send();
  }
};

/**
 * Checks that the parameters input to $export are valid. Returns true if all the
 * export params are valid, meaning no errors were thrown in the process.
 * @param {Object} parameters object containing a combination of request parameters from request query and body
 * @param {Object} reply the response object
 */
function validateExportParams(parameters, reply) {
  /**
   * According to http://hl7.org/fhir/async.html, we should also
   * account for abbreviated representations of ndjson
   */
  const ACCEPTEDOUTPUTFORMATS = ['application/fhir+ndjson', 'application/ndjson+fhir', 'application/ndjson', 'ndjson'];
  if (parameters._outputFormat) {
    if (!ACCEPTEDOUTPUTFORMATS.includes(parameters._outputFormat)) {
      reply
        .code(400)
        .send(
          new Error(
            `The following output format is not supported for _outputFormat param for $export: ${parameters._outputFormat}`
          )
        );
      return false;
    }
  }

  if (parameters.organizeOutputBy && parameters.organizeOutputBy !== 'Patient') {
    reply.code(400).send(
      createOperationOutcome(`Server does not support the organizeOutputBy parameter for values other than Patient.`, {
        issueCode: 400,
        severity: 'error'
      })
    );
    return false;
  }

  if (parameters._type) {
    // type filter is comma-delimited
    const requestTypes = parameters._type.split(',');
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
          createOperationOutcome(
            `The following resourceTypes are not supported for _type param for $export: ${unsupportedTypes.join(
              ', '
            )}.`,
            { issueCode: 400, severity: 'error' }
          )
        );
      return false;
    }
    if (parameters.organizeOutputBy === 'Patient' && !requestTypes.includes('Patient')) {
      reply
        .code(400)
        .send(
          createOperationOutcome(
            `When _type is specified with organizeOutputBy Patient, the Patient type must be included in the _type parameter.`,
            { issueCode: 400, severity: 'error' }
          )
        );
      return false;
    }
  }

  if (parameters._typeFilter) {
    const typeFilterArray = Array.isArray(parameters._typeFilter)
      ? parameters._typeFilter
      : parameters._typeFilter.split(',');
    const unsupportedTypeFilterTypes = [];
    typeFilterArray.forEach(line => {
      const resourceType = line.substring(0, line.indexOf('?'));
      // consider the query "unsupported" if no resource type is provided in query
      if (!resourceType) {
        unsupportedTypeFilterTypes.push(line);
        // consider the query "unsupported" if the resource type is not supported by the server
      } else if (!supportedResources.includes(resourceType)) {
        unsupportedTypeFilterTypes.push(resourceType);
      }
    });
    if (unsupportedTypeFilterTypes.length > 0) {
      reply
        .code(400)
        .send(
          createOperationOutcome(
            `The following resourceTypes are not supported for _typeFilter param for $export: ${unsupportedTypeFilterTypes.join(
              ', '
            )}.`,
            { issueCode: 400, severity: 'error' }
          )
        );
      return false;
    }
  }

  // add validation for the _elements query param
  if (parameters._elements) {
    const elementsArray = parameters._elements.split(',');
    const unsupportedResourceTypes = [];
    const unsupportedElementTypes = [];
    elementsArray.forEach(line => {
      // split each of the elements up by a '.' if it has one. If it does, the first part is the resourceType and the second is the element name
      // if there is no '.', we assume that the element is just the element name
      let resourceType = 'all';
      if (line.includes('.')) {
        resourceType = line.split('.')[0];
        if (!supportedResources.includes(resourceType)) {
          unsupportedResourceTypes.push(resourceType);
        }
      }
    });
    if (unsupportedResourceTypes.length > 0) {
      reply
        .code(400)
        .send(
          createOperationOutcome(
            `The following resourceTypes are not supported for _element param for $export: ${unsupportedResourceTypes.join(
              ', '
            )}.`,
            { issueCode: 400, severity: 'error' }
          )
        );
      return false;
    } else if (unsupportedElementTypes.length > 0) {
      reply
        .code(400)
        .send(
          createOperationOutcome(
            `The following resourceType and element names are not supported for _element param for $export: ${unsupportedResourceTypes.join(
              ', '
            )}.`,
            { issueCode: 400, severity: 'error' }
          )
        );
      return false;
    }
  }

  if (parameters.patient) {
    const referenceFormat = /^Patient\/[\w-]+$/;
    const errorMessage = 'All patient references must be of the format "Patient/{id}" for the "patient" parameter.';
    parameters.patient.forEach(p => {
      if (!referenceFormat.test(p.reference)) {
        reply.code(400).send(createOperationOutcome(errorMessage, { issueCode: 400, severity: 'error' }));
        return false;
      }
    });
  }

  let unrecognizedParams = [];
  Object.keys(parameters).forEach(param => {
    if (!['_outputFormat', '_type', '_typeFilter', 'patient', '_elements', 'organizeOutputBy'].includes(param)) {
      unrecognizedParams.push(param);
    }
  });
  if (unrecognizedParams.length > 0) {
    reply
      .code(400)
      .send(
        createOperationOutcome(
          `The following parameters are unrecognized by the server: ${unrecognizedParams.join(', ')}.`,
          { issueCode: 400, severity: 'error' }
        )
      );
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
 * @param {string} types the comma-delimited _type parameter, pulled from the query or body
 * @return array of resource types to use as reference for export after filtering out types that
 * are not permitted for patient-level export
 */
function filterPatientResourceTypes(request, reply, types) {
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

/**
 * Validates whether all the specified patients are available in the database.
 * Throws OperationOutcome if patients are specified that do not exist in the database.
 * @param {Array} patientParam array of patient references
 * @param {Object} reply the response object
 */
async function validatePatientReferences(patientParam, reply) {
  const unknownPatientPromises = patientParam.map(async p => {
    const splitRef = p.reference.split('/');
    const patientId = splitRef[splitRef.length - 1];
    const patient = await findResourceById(patientId, 'Patient');
    if (!patient) {
      return p.reference;
    }
    return null;
  });

  const results = (await Promise.all(unknownPatientPromises)).filter(p => p);

  if (results.length > 0) {
    const errorMessage = `The following patient ids are not available on the server: ${results.join(', ')}`;
    reply.code(404).send(createOperationOutcome(errorMessage, { issueCode: 404, severity: 'error' }));
  }
  return false;
}

module.exports = { bulkExport, patientBulkExport, groupBulkExport };
