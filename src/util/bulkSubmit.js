const FHIRClient = require('../util/fhirClient');

const performBulkSubmit = async (bulkSubmitEndpoint, bulkExportId) => {
  const submitParameters = constructParameters(bulkExportId);

  // TODO: add provenance?
  const headers = {
    accept: 'application/fhir+json',
    'content-type': 'application/fhir+json'
  };

  let baseUrl, submitEndpoint;
  if (bulkSubmitEndpoint.endsWith('$bulk-submit')) {
    submitEndpoint = bulkSubmitEndpoint;
    baseUrl = bulkSubmitEndpoint.slice(0, -12); // slice off "$bulk-submit"
  } else {
    baseUrl = bulkSubmitEndpoint;
    submitEndpoint = bulkSubmitEndpoint + (bulkSubmitEndpoint.endsWith('/') ? '' : '/') + '$bulk-submit';
  }
  const client = new FHIRClient(baseUrl);
  const results = await client.post(submitEndpoint, submitParameters, { headers });
  return results;
};

const constructParameters = bulkExportId => ({
  resourceType: 'Parameters',
  parameter: [
    {
      name: 'manifestUrl',
      valueUrl: `${process.env.BULK_BASE_URL}/bulkstatus/${bulkExportId}`
    },
    {
      name: 'submissionStatus',
      valueCoding: {
        system: 'http://hl7.org/fhir/event-status',
        code: 'completed'
      }
    },
    {
      // "The submitter SHALL match a system and value specified by the Data Consumer
      // (coordinated out-of-band or in an implementation guide specific to a use case)."
      // For proof-of-concept, just identify as bulk-export-server.
      name: 'submitter',
      valueIdentifier: {
        value: 'https://github.com/projecttacoma/bulk-export-server',
        system: 'urn:ietf:rfc:3986'
      }
    },
    {
      name: 'submissionId',
      valueString: bulkExportId
    },
    {
      name: 'fhirBaseUrl',
      valueUrl: process.env.BULK_BASE_URL
    }
  ]
});

module.exports = { performBulkSubmit };
