const {
  addPendingBulkExportRequest,
  findResourceById,
  findResourceByCanonical,
  findResourcesWithQuery
} = require('../util/mongo.controller');
const exportQueue = require('../resources/exportQueue');
const { patientAttributePaths } = require('fhir-spec-tools/build/data/patient-attribute-paths');
const patientResourceTypes = Object.keys(patientAttributePaths);
const { createOperationOutcome } = require('../util/errorUtils');
const { verifyPatientsInGroup, actualizeGroup } = require('../util/groupUtils');
const { gatherParams } = require('../util/serviceUtils');
const {
  validateCollectDataParams,
  validateExportParams,
  validatePatientReferences
} = require('../util/validationUtils');
const _ = require('lodash');
const {
  createDataExchangeMeasureReport,
  createPatientBundle,
  findPatientResources
} = require('../util/collectDataUtils');

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
      byPatient: parameters.organizeOutputBy === 'Patient',
      bulkSubmitEndpoint: parameters.bulkSubmitEndpoint
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
      byPatient: parameters.organizeOutputBy === 'Patient',
      bulkSubmitEndpoint: parameters.bulkSubmitEndpoint
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
      byPatient: parameters.organizeOutputBy === 'Patient',
      bulkSubmitEndpoint: parameters.bulkSubmitEndpoint
    };
    await exportQueue.createJob(job).save();
    reply.code(202).header('Content-location', `${process.env.BULK_BASE_URL}/bulkstatus/${clientEntry}`).send();
  }
};

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
 * Implements limited parameters for $collect-data according to https://build.fhir.org/ig/HL7/davinci-deqm/en/OperationDefinition-collect-data.html
 * Returns a set of bundles that have data of interest for the specified measures, organized by the specified subject
 * @param {Object} request the request object passed in by the user
 * @param {Object} reply the response object
 */
const collectData = async (request, reply) => {
  const parameters = gatherParams(request.method, request.query, request.body, reply);

  if (validateCollectDataParams(parameters, reply)) {
    request.log.info('Measure >>> $collect-data');

    const patientIds = await collectDataPatientIds(parameters, reply);
    // Check for measure resolution - errors if there are any issues with measures passed
    const measureArr = Array.isArray(parameters.measureUrl) ? parameters.measureUrl : [parameters.measureUrl];
    const measures = [];
    for (let url of measureArr) {
      const resources = await findResourceByCanonical(url, 'Measure');

      if (resources.length > 1) {
        reply
          .code(400)
          .send(
            createOperationOutcome(`Multiple versions of ${url} were found.`, { issueCode: 400, severity: 'error' })
          );
        return;
      } else if (resources.length === 1) {
        measures.push(resources[0]);
      } else {
        // return if we cant find a measure
        reply.code(404).send(
          createOperationOutcome(`Measure with url ${url} not found.`, {
            issueCode: 404,
            severity: 'error'
          })
        );
        return;
      }
    }

    const bundles = await Promise.all(
      patientIds.map(async id => {
        const patient = await findResourceById(id, 'Patient');
        const resourcesMRPairs = await Promise.all(
          measures.map(async measure => {
            const patientResources = await findPatientResources(patient, measure);
            const measureReport = createDataExchangeMeasureReport(
              measure,
              {
                start: parameters.periodStart,
                end: parameters.periodEnd
              },
              id,
              patientResources
            );
            return [patientResources, measureReport];
          })
        );
        const [patientResourcesArray, measureReports] = _.unzip(resourcesMRPairs);
        const uniqueResources = _.uniqBy(
          patientResourcesArray.flat(),
          resource => `${resource.resourceType}/${resource.id}`
        );
        return createPatientBundle(patient, uniqueResources, measureReports);
      })
    );

    reply.code(200).send({
      resourceType: 'Parameters',
      parameter: bundles.map(bundle => ({
        name: 'return',
        resource: bundle
      }))
    });
  }
};

/**
 * Collects patient ids for a collect-data request from a Patient subject, Group subject,
 * subjectGroup parameter, or all available patients when no subject filter is provided.
 * @param {Object} parameters object containing collect-data request parameters
 * @param {Object} reply the response object
 * @returns {Promise<string[]>} array of patient ids to collect data for
 */
async function collectDataPatientIds(parameters, reply) {
  if (parameters.subject) {
    if (parameters.subject.startsWith('Patient')) {
      validatePatientReferences([parameters.subject], reply);
      return [parameters.subject.split('Patient/')[1]];
    } else if (parameters.subject.startsWith('Group')) {
      const groupId = parameters.subject.split('Group/')[1];
      const group = await findResourceById(groupId, 'Group');
      if (!group) {
        const errorMessage = `The following group id is not available on the server: ${groupId}`;
        reply.code(404).send(createOperationOutcome(errorMessage, { issueCode: 404, severity: 'error' }));
      }
      return group.member.map(m => m.entity.reference.split('Patient/')[1]);
    }
  } else if (parameters.subjectGroup) {
    const patientReferences = parameters.subjectGroup.member.map(m => m.entity.reference);
    validatePatientReferences(patientReferences, reply);
    return parameters.subjectGroup.member.map(m => m.entity.reference.split('Patient/')[1]);
  }

  // if neither subject nor subjectGroup are provided, default to all patients
  const patients = await findResourcesWithQuery({}, 'Patient', { projection: { _id: 0, id: 1 } });
  return patients.map(patient => patient.id);
}

module.exports = { bulkExport, patientBulkExport, groupBulkExport, collectData };
