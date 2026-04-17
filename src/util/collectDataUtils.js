const { v4: uuidv4 } = require('uuid');
const { patientAttributePaths } = require('fhir-spec-tools/build/data/patient-attribute-paths');
const patientResourceTypes = Object.keys(patientAttributePaths);
const { addTypeFilter, getDocuments } = require('./exportToNDJson');
const _ = require('lodash');

/**
 * Creates a patient bundle resource. Creates using a patient resource and
 * an array of the patient's associated resources
 * @param {Object} patient FHIR Patient object
 * @param {Array} resources array of resources associated with the patient
 * @param {Array} measureReports array of MeasureReport resources specifying measure information for data exchange
 * @returns {Object} a FHIR patient bundle resource
 */
function createPatientBundle(patient, resources, measureReports) {
  const bundle = {
    type: 'transaction',
    resourceType: 'Bundle',
    id: uuidv4(),
    entry: []
  };
  resources.forEach(r => {
    bundle.entry?.push({
      resource: r,
      request: {
        method: 'PUT',
        url: `${r.resourceType}/${r.id}`
      },
      fullUrl: r.fullUrl ?? `urn:uuid:${r.id}`
    });
  });

  measureReports.forEach(measureReport => {
    bundle.entry?.push({
      resource: measureReport,
      request: {
        method: 'PUT',
        url: `MeasureReport/${measureReport.id}`
      },
      fullUrl: measureReport.fullUrl ?? `urn:uuid:${measureReport.id}`
    });
  });

  return bundle;
}

/**
 * Creates a FHIR data exchange MeasureReport from measure and subject data
 * https://hl7.org/fhir/us/davinci-deqm/STU5/StructureDefinition-datax-measurereport-deqm.html
 * @param measure FHIR Measure
 * @param measurementPeriod FHIR Period representing the measurement period
 * @param subjectId the patient id the MeasureReport is associated with
 * @param patientResources the patient resources of relevance to the passed measure
 * @returns { fhir4.MeasureReport } a data exchange measure report used to send Measure-relevant data to a server
 */
function createDataExchangeMeasureReport(measure, measurementPeriod, subjectId, patientResources) {
  return {
    resourceType: 'MeasureReport',
    id: uuidv4(),
    measure: measure.url?.includes('|') ? measure.url : `${measure.url}|${measure.version}`, //canonical measure/version
    period: measurementPeriod,
    status: 'complete',
    type: 'data-collection',
    subject: { reference: `Patient/${subjectId}` },
    date: new Date().toISOString(),
    reporter: { reference: 'Organization/bulk-export-server' }, //TODO: do we need to send an organization resource?
    meta: {
      profile: ['http://hl7.org/fhir/us/davinci-deqm/StructureDefinition/datax-measurereport-deqm']
    },
    extension: [
      {
        url: 'http://hl7.org/fhir/us/davinci-deqm/StructureDefinition/extension-submitDataUpdateType',
        valueCode: 'snapshot'
      }
    ],
    evaluatedResource: patientResources?.map(r => {
      return { reference: `${r.resourceType}/${r.id}` };
    }),
    contained: [{ resourceType: 'Organization', id: 'bulk-export-server' }]
  };
}

/**
 * Finds all resources related to the passed patient resource but limited by the data requirements on the passed measure
 * @param {FHIR.Patient} patient fhir patient resource
 * @param {FHIR.Measure} measure fhir measure resource
 * @returns {Array} an array of filtered fhir resources related to the passed patient
 */
async function findPatientResources(patient, measure) {
  const dataRequirements = measure.contained?.find(c => c.id === 'effective-data-requirements').dataRequirement;
  const types = _.uniq(dataRequirements.map(dr => dr.type));
  const [patientTypes, nonPatientTypes] = types.reduce(
    ([patient, nonPatient], type) => {
      (patientResourceTypes.includes(type) ? patient : nonPatient).push(type);
      return [patient, nonPatient];
    },
    [[], []]
  );
  // nonPatientTypes can be in data requirements when they may be referenced from other resources that reference patients
  // i.e. Patient references MedicationRequest references Medication could end up with Medication as non-patient type
  // ignored for now, but should either get all (non-patient query) or be able to do more complex query creation
  if (nonPatientTypes.length > 0) {
    console.warn('Ignoring non-patient types found in data requirements:', nonPatientTypes);
  }
  const typeFilters = typeFiltersForMeasure(dataRequirements);
  // create lookup objects for (1) _typeFilter queries that contain search parameters, and (2) _typeFilter
  // queries that contain type:in/code:in/etc. queries
  const searchParameterQueries = {};
  const valueSetQueries = {};
  if (typeFilters) {
    addTypeFilter(typeFilters, searchParameterQueries, valueSetQueries);
  }

  // for each patient, collect resource documents from each export type collection
  const typeDocs = patientTypes.map(async collectionName => {
    return (
      await getDocuments(collectionName, searchParameterQueries[collectionName], valueSetQueries[collectionName], [
        patient.id
      ])
    ).document;
  });

  //flatten all type arrays into a single array
  return (await Promise.all(typeDocs)).flat();
}

function typeFiltersForMeasure(dataRequirements) {
  // create record resourcetype => [] of valid typeFilter query strings that will be separated by "&" and logically handled as ORs
  const typeFilters = {};
  dataRequirements.forEach(dr => {
    //empty array is general _type query that overrides a more specific _typeFilter
    if (typeFilters[dr.type]?.length === 0) return; // only handle data requirements with types for now

    if (
      dr.codeFilter?.some(cf => {
        const hasVS = cf.path && cf.valueSet;
        const hasCode = cf.path && cf.code && cf.code.every(coding => !!coding.code);
        const hasNeither = !hasVS && !hasCode;
        return hasNeither;
      })
    ) {
      // if any codeFilter for a data requirement doesn't have sufficient information, default to getting all for that type (general _type query)
      typeFilters[dr.type] = [];
      return;
    }
    //all codefilters have a path and proper code and can be added to our typefilter array
    const fhirQueries = dr.codeFilter?.map(cf => {
      const hasVS = cf.path && cf.valueSet;
      const hasCode = cf.path && cf.code && cf.code.every(coding => !!coding.code);
      if (hasVS && hasCode) {
        // default to valueset method for now, but this should probably be expanded to a full list of codes from the vs with additional
        // codes appended (or separated into separate top-level queries where other included codeFilters are repeated
        // Example: 'Procedure?code=1&category=3,4','Procedure?code=1&category:in=vs')
        return `${cf.path}:in=${cf.valueSet}`;
      } else if (hasVS) {
        return `${cf.path}:in=${cf.valueSet}`;
      } else {
        // hasCode
        // potential multiple codes are comma-separated to be OR'd for this path
        return `${cf.path}=${cf.code?.map(coding => coding.code).join(',')}`;
      }
    });
    const tfStr = `${dr.type}?${fhirQueries?.join('&')}`; //Example value: 'Procedure?code=1,2&category=3,4'
    if (typeFilters[dr.type]) {
      typeFilters[dr.type].push(tfStr);
    } else {
      typeFilters[dr.type] = [tfStr];
    }
  });

  // array of typeFilters that should be treated as OR'd (empty array will be ignored and flattened)
  return Object.values(typeFilters).flat();
}

module.exports = { createPatientBundle, createDataExchangeMeasureReport, findPatientResources };
