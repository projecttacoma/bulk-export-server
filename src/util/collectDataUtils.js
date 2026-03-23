const { v4: uuidv4 } = require('uuid');
/**
 * Creates a patient bundle resource. Creates using a patient resource and
 * an array of the patient's associated resources
 * @param {Object} patient FHIR Patient object
 * @param {Array} entries array of FHIR BundleEntry's associated with the patient
 * @param {String} fullUrl fullUrl for patient
 * @param {Object} testMeasureReport MeasureReport specifying measure information for data exchagne
 * @returns {Object} a FHIR patient bundle resource
 */
export function createPatientBundle(patient, entries, fullUrl, measureReport) {
  const bundle = {
    type: 'transaction',
    resourceType: 'Bundle',
    id: uuidv4(),
    entry: [
      {
        resource: patient,
        request: {
          method: 'PUT',
          url: `Patient/${patient.id}`
        },
        fullUrl: fullUrl
      }
    ]
  };
  entries.forEach(entry => {
    bundle.entry?.push({
      ...entry,
      request: {
        method: 'PUT',
        url: `${entry.resource?.resourceType}/${entry.resource?.id}`
      }
    });
  });

  bundle.entry?.push({
    resource: measureReport,
    request: {
      method: 'PUT',
      url: `MeasureReport/${measureReport.id}`
    },
    fullUrl: `urn:uuid:${measureReport.id}`
  });

  return bundle;
}

/**
 * Creates a FHIR data exchange MeasureReport from measure and subject data
 * https://build.fhir.org/ig/HL7/davinci-deqm/StructureDefinition-datax-measurereport-deqm.html
 * @param measure FHIR Measure
 * @param measurementPeriod FHIR Period representing the measurement period
 * @param subjectId the patient id the MeasureReport is associated with
 * @returns { fhir4.MeasureReport } a data exchange measure report used to send Measure-relevant data to a server
 */
export function createDataExchangeMeasureReport(measure, measurementPeriod, subjectId) {
  return {
    resourceType: 'MeasureReport',
    id: uuidv4(),
    measure: measure.url?.includes('|') ? measure.url : `${measure.url}|${measure.version}`, //canonical measure/version
    period: measurementPeriod,
    status: 'complete',
    type: 'data-collection',
    subject: { reference: `Patient/${subjectId}` },
    date: jsDateToFHIRDate(new Date()),
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
    contained: [{ resourceType: 'Organization', id: 'bulk-export-server' }]
  };
}

/**
 * Converts a JS date to a FHIR date string
 * @param {Date} date JS date to be converted
 * @returns {String} a string representing a FHIR date
 */
export function jsDateToFHIRDate(date) {
  const year = date.getFullYear();
  // month is 0 indexed
  const month = date.getMonth() + 1;
  const day = date.getDate();
  return `${year}-${month < 10 ? `0${month}` : month}-${day < 10 ? `0${day}` : day}`;
}
