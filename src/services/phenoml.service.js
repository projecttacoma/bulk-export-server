const { phenomlClient } = require('phenoml');

/**
 * Creates a PhenoML client using either PHENOML_TOKEN or the SDK-supported
 * PHENOML_CLIENT_ID/PHENOML_CLIENT_SECRET credentials.
 * @returns {phenomlClient}
 */
function createPhenomlClient() {
  const options = {};

  if (process.env.PHENOML_BASE_URL) {
    options.baseUrl = process.env.PHENOML_BASE_URL;
  }
  if (process.env.PHENOML_TOKEN) {
    options.token = process.env.PHENOML_TOKEN;
  }

  return new phenomlClient(options);
}

/**
 * Calls PhenoML's Cohort API to convert natural-language cohort text into
 * structured FHIR search concepts.
 * @param {string} text natural-language patient cohort description
 * @returns {Promise<Object>} PhenoML CohortResponse
 */
async function postCohort(text) {
  const client = createPhenomlClient();
  return client.cohort.analyze({ text });
}

module.exports = { postCohort, createPhenomlClient };
