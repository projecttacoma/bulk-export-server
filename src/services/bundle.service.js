const { v4: uuidv4 } = require('uuid');
const { replaceReferences } = require('../util/bundleUtils');
const { createResource, updateResource } = require('../util/mongo.controller');

/**
 * Creates transaction-response bundle.
 * Each entry elements SHALL contain a 'response' element which
 * indicates the outcome of the HTTP operation.
 * @param {Array} requestResults array of request result objects
 * @param {Object} reply the response object
 *
 * @returns {Object} transaction-response bundle
 */
const createTransactionResponseBundle = (requestResults, reply) => {
  const bundle = {
    resourceType: 'Bundle',
    type: 'transaction-response',
    id: uuidv4()
  };

  bundle.link = [
    {
      url: `${reply.request.protocol}://${reply.request.hostname}`,
      relation: 'self'
    }
  ];

  const entries = [];
  requestResults.forEach(result => {
    const entry = {
      response: {
        status: `${result.status} ${result.statusText}`
      }
    };
    if (result.status === 200 || result.status === 201) {
      entry.response.location = `/${result.resource.resourceType}/${result.resource.id}`;
    } else {
      entry.response.outcome = result.data;
    }
    entries.push(entry);
  });

  bundle.entry = entries;
  return bundle;
};

/**
 * Uploads transaction bundle to server.
 * @param {Object} request the request object passed in by the user
 * @param {Object} reply the response object
 *
 * @returns {Object} transaction-response bundle
 */
const uploadTransactionBundle = async (request, reply) => {
  request.log.info('Base >>> Transaction Bundle Upload');
  const { resourceType, type, entry: entries } = request.body;

  if (resourceType !== 'Bundle') {
    reply.code(400).send(new Error(`Expected 'resourceType: Bundle', but received 'resourceType: ${resourceType}'.`));
  }
  if (type.toLowerCase() !== 'transaction') {
    reply.code(400).send(new Error(`Expected 'type: transaction'. Received 'type: ${type}'.`));
  }

  const requestResults = await uploadResourcesFromBundle(entries);
  const bundle = createTransactionResponseBundle(requestResults, reply);
  request.log.info('Transaction bundle successfully uploaded to server');
  return bundle;
};

/**
 * Scrubs transaction bundle entries and uploads each entry to the server.
 * @param {Array} entries entries from POSTed transaction bundle
 * @returns array of request results
 */
const uploadResourcesFromBundle = async entries => {
  const scrubbedEntries = replaceReferences(entries);
  const requestsArray = scrubbedEntries.map(async entry => {
    const { method } = entry.request;
    return insertBundleResources(entry, method).catch(e => {
      const results = {
        resourceType: 'OperationOutcome',
        issue: e.issue,
        statusCode: e.statusCode
      };
      return {
        status: e.statusCode,
        statusCode: e.statusCode,
        statusText: e.issue[0].code,
        data: results.toJSON()
      };
    });
  });
  const requestResults = await Promise.all(requestsArray);
  return requestResults;
};

/**
 * Inserts/Updates the bundle entry as a document in mongo
 * @param {Object} entry entry object from POSTed transaction bundle
 * @param {string} method method of the HTTP request (POST/PUT)
 * @returns results of mongo insertion or update
 */
const insertBundleResources = async (entry, method) => {
  if (method === 'POST') {
    entry.resource.id = uuidv4();
    const { id } = await createResource(entry.resource, entry.resource.resourceType);
    if (id != null) {
      entry.status = 201;
      entry.statusText = 'Created';
    }
  }
  if (method === 'PUT') {
    const { id, created } = await updateResource(entry.resource.id, entry.resource, entry.resource.resourceType);
    if (created === true) {
      entry.status = 201;
      entry.statusText = 'Created';
    } else if (id != null && created === false) {
      entry.status = 200;
      entry.statusText = 'OK';
    }
  } else {
    throw new Error(
      `Expected requests of type PUT or POST, received ${method} for ${entry.resource.resourceType}/${entry.resource.id}`
    );
  }
  return entry;
};

module.exports = { uploadTransactionBundle };
