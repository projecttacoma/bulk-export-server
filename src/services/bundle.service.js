const { v4: uuidv4 } = require('uuid');
const { replaceReferences } = require('../util/bundleUtils');
const { createResource, updateResource } = require('../util/mongo.controller');

/**
 * Creates transaction-response bundle.
 * Each entry elements SHALL contain a 'response' element which
 * indicates the outcome of the HTTP operation.
 * @param {Array} requestResults array of request result objects
 * @param {Object} reply the response object
 * @param {type} type bundle type (must be 'transaction' or 'batch')
 *
 * @returns {Object} transaction-response bundle
 */
const createResponseBundle = (requestResults, reply, type) => {
  const bundle = {
    resourceType: 'Bundle',
    type: `${type}-response`,
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
const uploadTransactionOrBatchBundle = async (request, reply) => {
  request.log.info('Base >>> Transaction/Batch Bundle Upload');
  const { resourceType, type, entry: entries } = request.body;

  if (resourceType !== 'Bundle') {
    reply.code(400).send(new Error(`Expected 'resourceType: Bundle', but received 'resourceType: ${resourceType}'.`));
  }
  if (!['transaction', 'batch'].includes(type.toLowerCase())) {
    reply.code(400).send(new Error(`Expected 'type: transaction' or 'type: batch'. Received 'type: ${type}'.`));
  }

  if (type.toLowerCase() == 'transaction') {
    const requestResults = await uploadResourcesFromTxnBundle(entries, reply);
    const bundle = createResponseBundle(requestResults, reply, 'transaction');
    request.log.info('Transaction bundle successfully uploaded to server');
    return bundle;
  } else {
    const requestResults = await uploadResourcesFromBatchBundle(entries);
    const bundle = createResponseBundle(requestResults, reply, 'batch');
    request.log.info('Batch bundle successfully uploaded to server');
    return bundle;
  }
};

/**
 * Scrubs transaction bundle entries and uploads each entry to the server.
 * @param {Array} entries entries from POSTed transaction bundle
 * @param {Object} reply the response object
 * @returns array of request results
 */
const uploadResourcesFromTxnBundle = async (entries, reply) => {
  const scrubbedEntries = replaceReferences(entries);
  const requestsArray = scrubbedEntries.map(async entry => {
    const { method } = entry.request;
    return insertBundleResources(entry, method).catch(e => {
      reply.code(400).send(e.message);
    });
  });
  const requestResults = await Promise.all(requestsArray);
  return requestResults;
};

/**
 * Scrubs batch bundle entries and uploads each entry to the server.
 * @param {Array} entries entries from POSTed batch bundle
 * @returns array of request results
 */
const uploadResourcesFromBatchBundle = async entries => {
  const scrubbedEntries = replaceReferences(entries);
  const requestsArray = scrubbedEntries.map(async entry => {
    const { method } = entry.request;
    return insertBundleResources(entry, method).catch(() => {
      return null;
    });
  });
  const requestResults = await Promise.all(requestsArray);
  return requestResults.filter(results => results !== null);
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

module.exports = { uploadTransactionOrBatchBundle };
