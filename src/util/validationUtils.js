const { findResourceById } = require('./mongo.controller');
const supportedResources = require('./supportedResources').filter(r => r !== 'ValueSet'); //exclude ValueSet (may be stored but not exported)
const { createOperationOutcome } = require('./errorUtils');

// Preferable over truthy check to allow for boolean or 0
function paramPresent(parameters, param) {
  const value = parameters[param];
  return value !== undefined && value !== null && value !== '';
}

// Accept bulkSubmitStatusEndpoint, but currently do nothing with it
const EXPORT_RECOGNIZED_PARAMS = [
  '_outputFormat',
  '_type',
  '_typeFilter',
  'patient',
  '_elements',
  'organizeOutputBy',
  'bulkSubmitEndpoint',
  'bulkSubmitStatusEndpoint'
];

const COLLECT_DATA_RECOGNIZED_PARAMS = [
  'measureUrl',
  'periodStart',
  'periodEnd',
  'subject',
  'subjectGroup',
  'reporter',
  'reporterResource',
  'location',
  'lastReceivedOn',
  'parameters',
  'manifest',
  'validateResources',
  'dataEndpoint'
];

const COLLECT_DATA_SUPPORTED_PARAMS = ['measureUrl', 'periodStart', 'periodEnd', 'subject', 'subjectGroup'];
const COLLECT_DATA_REQUIRED_PARAMS = ['measureUrl', 'periodStart', 'periodEnd'];
const COLLECT_DATA_SINGLE_CARDINALITY_PARAMS = ['periodStart', 'periodEnd', 'subject', 'subjectGroup'];

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
  if (paramPresent(parameters, '_outputFormat')) {
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

  if (paramPresent(parameters, 'organizeOutputBy') && parameters.organizeOutputBy !== 'Patient') {
    reply.code(400).send(
      createOperationOutcome(`Server does not support the organizeOutputBy parameter for values other than Patient.`, {
        issueCode: 400,
        severity: 'error'
      })
    );
    return false;
  }

  if (paramPresent(parameters, '_type')) {
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

  if (paramPresent(parameters, '_typeFilter')) {
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
  if (paramPresent(parameters, '_elements')) {
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

  if (paramPresent(parameters, 'patient')) {
    const referenceFormat = /^Patient\/[\w.-]+$/;
    const errorMessage = 'All patient references must be of the format "Patient/{id}" for the "patient" parameter.';
    parameters.patient.forEach(p => {
      if (!referenceFormat.test(p)) {
        reply.code(400).send(createOperationOutcome(errorMessage, { issueCode: 400, severity: 'error' }));
        return false;
      }
    });
  }

  let unrecognizedParams = [];
  Object.keys(parameters).forEach(param => {
    if (!EXPORT_RECOGNIZED_PARAMS.includes(param)) {
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
 * Validates whether all the specified patients are available in the database.
 * Throws OperationOutcome if patients are specified that do not exist in the database.
 * @param {Array} patientParam array of patient references
 * @param {Object} reply the response object
 */
async function validatePatientReferences(patientParam, reply) {
  const unknownPatientPromises = patientParam.map(async p => {
    const splitRef = p.split('/');
    const patientId = splitRef[splitRef.length - 1];
    const patient = await findResourceById(patientId, 'Patient');
    if (!patient) {
      return p;
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

/**
 * Checks that the parameters input to $collect-data are valid. Returns true if all the
 * collect-data params are valid, meaning no errors were thrown in the process.
 * @param {Object} parameters object containing a combination of request parameters from request query and body
 * @param {Object} reply the response object
 */
function validateCollectDataParams(parameters, reply) {
  let unrecognizedParams = [];
  Object.keys(parameters).forEach(param => {
    if (!COLLECT_DATA_RECOGNIZED_PARAMS.includes(param)) {
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

  const missingRequiredParams = COLLECT_DATA_REQUIRED_PARAMS.filter(param => !paramPresent(parameters, param));
  if (missingRequiredParams.length > 0) {
    if (missingRequiredParams.length === 1 && missingRequiredParams[0] === 'measureUrl') {
      reply
        .code(400)
        .send(createOperationOutcome('At least one measureUrl is required.', { issueCode: 400, severity: 'error' }));
    } else {
      reply
        .code(400)
        .send(
          createOperationOutcome(
            `The following required parameters are missing for $collect-data: ${missingRequiredParams.join(', ')}.`,
            { issueCode: 400, severity: 'error' }
          )
        );
    }
    return false;
  }

  const repeatedSingleCardinalityParams = COLLECT_DATA_SINGLE_CARDINALITY_PARAMS.filter(param =>
    Array.isArray(parameters[param])
  );
  if (repeatedSingleCardinalityParams.length > 0) {
    reply
      .code(400)
      .send(
        createOperationOutcome(
          `The following parameters can only be provided once for $collect-data: ${repeatedSingleCardinalityParams.join(
            ', '
          )}.`,
          { issueCode: 400, severity: 'error' }
        )
      );
    return false;
  }

  const hasSubject = paramPresent(parameters, 'subject');
  const hasSubjectGroup = paramPresent(parameters, 'subjectGroup');
  if (hasSubject && hasSubjectGroup) {
    reply.code(400).send(
      createOperationOutcome('Only one of subject or subjectGroup may be specified for $collect-data.', {
        issueCode: 400,
        severity: 'error'
      })
    );
    return false;
  }

  let unsupportedParams = [];
  Object.keys(parameters).forEach(param => {
    if (!COLLECT_DATA_SUPPORTED_PARAMS.includes(param)) {
      unsupportedParams.push(param);
    }
  });
  if (unsupportedParams.length > 0) {
    reply
      .code(501)
      .send(
        createOperationOutcome(
          `The following parameters are not yet supported by the server: ${unsupportedParams.join(', ')}.`,
          { issueCode: 501, severity: 'error' }
        )
      );
    return false;
  }

  const subjectReference = parameters.subject;
  if (hasSubject && !/^(Patient|Group)\/[\w.-]+$/.test(subjectReference)) {
    reply.code(400).send(
      createOperationOutcome(
        'The subject parameter must be a Patient or Group reference of the format "Patient/{id}".',
        {
          issueCode: 400,
          severity: 'error'
        }
      )
    );
    return false;
  }
  return true;
}

module.exports = {
  validateCollectDataParams,
  validateExportParams,
  validatePatientReferences
};
