const _ = require('lodash');
const { patientAttributePaths } = require('fhir-spec-tools/build/data/patient-attribute-paths');
const { addPendingBulkExportRequest } = require('../util/mongo.controller');
const { createOperationOutcome } = require('../util/errorUtils');
const { addTypeFilter, getDocuments } = require('../util/exportToNDJson');
const { gatherParams } = require('../util/serviceUtils');
const exportQueue = require('../resources/exportQueue');
const supportedResources = require('../util/supportedResources').filter(r => r !== 'ValueSet');
const { postCohort } = require('./phenoml.service');
const { filterPatientResourceTypes, validateExportParams } = require('./export.service');

const patientResourceTypes = Object.keys(patientAttributePaths);
const DESCRIPTION_PARAMS = ['text', 'description', 'cohortDescription'];

/**
 * FHIR operation that accepts natural-language text, asks PhenoML to turn it into
 * FHIR search queries, resolves those queries to a patient cohort, and kicks off
 * this server's existing bulk export workflow for the resulting patients.
 * @param {Object} request the request object passed in by the user
 * @param {Object} reply the response object
 */
const phenomlCohortBulkExport = async (request, reply) => {
  const parameters = gatherCohortParams(request, reply);
  if (reply.sent) return;

  const description = getDescription(parameters);
  if (!description) {
    reply.code(400).send(
      createOperationOutcome('A cohort description is required using the "text" parameter.', {
        issueCode: 400,
        severity: 'error'
      })
    );
    return;
  }

  const exportParams = { ...parameters };
  DESCRIPTION_PARAMS.forEach(param => delete exportParams[param]);

  if (exportParams.patient) {
    reply
      .code(400)
      .send(
        createOperationOutcome(
          'The "patient" parameter cannot be used with natural-language cohort export. Include patient criteria in the text description.',
          { issueCode: 400, severity: 'error' }
        )
      );
    return;
  }

  if (!validateExportParams(exportParams, reply)) {
    return;
  }

  let cohortResponse;
  try {
    cohortResponse = await postCohort(description);
    console.log(cohortResponse);
  } catch (e) {
    sendPhenomlError(e, reply);
    return;
  }

  const concepts = normalizeSearchConcepts(cohortResponse.queries, reply);
  if (!concepts) return;

  let patientIds;
  try {
    patientIds = await patientIdsForConcepts(concepts);
  } catch (e) {
    request.log.error(e);
    reply.code(400).send(
      createOperationOutcome(`Unable to resolve PhenoML cohort queries: ${e.message}`, {
        issueCode: 400,
        severity: 'error'
      })
    );
    return;
  }

  request.log.info('Group >>> PhenoML natural-language cohort $export');
  const fullURL = `${request.protocol}://${request.hostname}${request.originalUrl}`;
  const clientEntry = await addPendingBulkExportRequest(exportParams.organizeOutputBy === 'Patient', fullURL);

  let types = exportParams._type?.split(',');
  if (types) {
    types = filterPatientResourceTypes(request, reply, types);
    if (reply.sent) return;
  } else {
    types = patientResourceTypes;
  }

  const elements = exportParams._elements?.split(',');
  const typeFilter = combineTypeFilters(exportParams._typeFilter, concepts);

  const job = {
    clientEntry: clientEntry,
    types: types,
    typeFilter: typeFilter,
    systemLevelExport: false,
    patientIds: patientIds,
    elements: elements,
    byPatient: exportParams.organizeOutputBy === 'Patient',
    bulkSubmitEndpoint: exportParams.bulkSubmitEndpoint,
    cohort: {
      description,
      patientCount: patientIds.length,
      queries: concepts.map(({ original, typeFilter }) => ({ ...original, typeFilter }))
    }
  };
  await exportQueue.createJob(job).save();
  reply.code(202).header('Content-location', `${process.env.BULK_BASE_URL}/bulkstatus/${clientEntry}`).send();
};

function gatherCohortParams(request, reply) {
  if (request.method === 'POST' && request.body && request.body.resourceType !== 'Parameters') {
    if (Object.keys(request.query).length > 0) {
      reply.code(400).send(
        createOperationOutcome('Parameters must be specified in a request body for POST requests.', {
          issueCode: 400,
          severity: 'error'
        })
      );
      return {};
    }
    return { ...request.body };
  }
  return gatherParams(request.method, request.query, request.body, reply);
}

function getDescription(parameters) {
  const description = DESCRIPTION_PARAMS.map(param => parameters[param]).find(Boolean);
  return typeof description === 'string' ? description.trim() : null;
}

function sendPhenomlError(error, reply) {
  const statusCode = error.statusCode && error.statusCode < 500 ? error.statusCode : 502;
  const bodyMessage = typeof error.body === 'object' ? error.body.message || error.body.detail : error.body;
  const message = bodyMessage || error.message || 'Unknown PhenoML error';
  reply.code(statusCode).send(
    createOperationOutcome(`PhenoML cohort analysis failed: ${message}`, {
      issueCode: statusCode,
      severity: 'error'
    })
  );
}

function normalizeSearchConcepts(queries, reply) {
  if (!Array.isArray(queries) || queries.length === 0) {
    reply.code(400).send(
      createOperationOutcome('PhenoML did not return any FHIR search queries for the cohort description.', {
        issueCode: 400,
        severity: 'error'
      })
    );
    return null;
  }

  const concepts = [];
  const unsupportedTypes = [];
  const nonPatientTypes = [];

  queries.forEach(query => {
    const resourceType = query.resource_type || query.resourceType;
    let searchParams = query.search_params || query.searchParams;

    if (!resourceType || !searchParams) {
      return;
    }
    if (searchParams.startsWith('?')) {
      searchParams = searchParams.slice(1);
    }

    const typeFilter = searchParams.startsWith(`${resourceType}?`) ? searchParams : `${resourceType}?${searchParams}`;

    if (!supportedResources.includes(resourceType)) {
      unsupportedTypes.push(resourceType);
    } else if (!patientResourceTypes.includes(resourceType)) {
      nonPatientTypes.push(resourceType);
    } else {
      concepts.push({
        resourceType,
        searchParams,
        typeFilter,
        exclude: query.exclude === true,
        original: query
      });
    }
  });

  if (unsupportedTypes.length > 0) {
    reply
      .code(400)
      .send(
        createOperationOutcome(
          `PhenoML returned queries for unsupported resourceTypes: ${_.uniq(unsupportedTypes).join(', ')}.`,
          { issueCode: 400, severity: 'error' }
        )
      );
    return null;
  }

  if (nonPatientTypes.length > 0) {
    reply
      .code(400)
      .send(
        createOperationOutcome(
          `PhenoML returned queries for resourceTypes that are not permitted for Patient/Group export: ${_.uniq(
            nonPatientTypes
          ).join(', ')}.`,
          { issueCode: 400, severity: 'error' }
        )
      );
    return null;
  }

  if (concepts.length === 0) {
    reply.code(400).send(
      createOperationOutcome('PhenoML did not return usable FHIR search queries for the cohort description.', {
        issueCode: 400,
        severity: 'error'
      })
    );
    return null;
  }

  return concepts;
}

async function patientIdsForConcepts(concepts) {
  const inclusions = concepts.filter(concept => !concept.exclude);
  const exclusions = concepts.filter(concept => concept.exclude);

  const inclusionSets =
    inclusions.length > 0 ? await Promise.all(inclusions.map(patientIdsForConcept)) : [await allPatientIds()];
  let patientIds = _.intersection(...inclusionSets);

  if (exclusions.length > 0) {
    const excludedPatientIds = _.union(...(await Promise.all(exclusions.map(patientIdsForConcept))));
    patientIds = _.difference(patientIds, excludedPatientIds);
  }

  return patientIds;
}

async function allPatientIds() {
  const patients = (await getDocuments('Patient', null, null, null, null)).document;
  return patients.map(patient => patient.id);
}

async function patientIdsForConcept(concept) {
  const searchParameterQueries = {};
  const valueSetQueries = {};
  addTypeFilter([concept.typeFilter], searchParameterQueries, valueSetQueries);

  const docs = (
    await getDocuments(
      concept.resourceType,
      searchParameterQueries[concept.resourceType],
      valueSetQueries[concept.resourceType],
      null,
      null
    )
  ).document;

  if (concept.resourceType === 'Patient') {
    return _.uniq(docs.map(doc => doc.id));
  }

  return _.uniq(
    docs
      .flatMap(doc => patientAttributePaths[concept.resourceType].flatMap(path => valuesAtPath(doc, path)))
      .map(reference => reference?.reference)
      .filter(reference => reference?.startsWith('Patient/'))
      .map(reference => reference.split('/').pop())
  );
}

function valuesAtPath(resource, path) {
  const values = path.split('.').reduce(
    (values, part) =>
      values
        .flatMap(value => (Array.isArray(value) ? value : [value]))
        .map(value => value?.[part])
        .filter(Boolean),
    [resource]
  );
  return values.flatMap(value => (Array.isArray(value) ? value : [value]));
}

function combineTypeFilters(requestTypeFilter, concepts) {
  const generatedTypeFilters = concepts.filter(concept => !concept.exclude).map(concept => concept.typeFilter);
  const requestTypeFilters = requestTypeFilter
    ? Array.isArray(requestTypeFilter)
      ? requestTypeFilter
      : requestTypeFilter.split(',')
    : [];
  const combined = [...requestTypeFilters, ...generatedTypeFilters];
  return combined.length > 0 ? combined : undefined;
}

module.exports = {
  phenomlCohortBulkExport,
  normalizeSearchConcepts,
  patientIdsForConcepts,
  combineTypeFilters
};
