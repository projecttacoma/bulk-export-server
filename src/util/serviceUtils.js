
const { createOperationOutcome } = require('../util/errorUtils');

/**
 * Pulls query parameters from both the url query and request body and creates a new parameters map
 * @param {string} method the request method (POST, GET, etc.)
 * @param {Object} query the query terms on the request URL
 * @param {Object} body http request body
 * @param {Object} reply the response object
 * @returns {Object} an object containing a combination of request parameters from both sources
 */
function gatherParams (method, query, body, reply){
  if (method === 'POST' && Object.keys(query).length > 0) {
    reply.code(400).send(
      createOperationOutcome('Parameters must be specified in a request body for POST requests.', {
        issueCode: 400,
        severity: 'error'
      })
    );
  }
  if (body) {
    if (!body.resourceType || body.resourceType !== 'Parameters') {
      reply.code(400).send(
        createOperationOutcome('Parameters must be specified in a request body of resourceType "Parameters."', {
          issueCode: 400,
          severity: 'error'
        })
      );
    }
  }
  const params = { ...query };
  if (body && body.parameter) {
    body.parameter.reduce((acc, e) => {
      if (!e.resource) {
        if (e.name === 'patient') {
          if (!acc[e.name]) {
            acc[e.name] = [e.valueReference];
          } else {
            acc[e.name].push(e.valueReference);
          }
        } else {
          // For now, all usable params are expected to be stored under one of these fives keys
          acc[e.name] = e.valueDate || e.valueString || e.valueId || e.valueCode || e.valueReference;
        }
      }
      return acc;
    }, params);
  }
  return params;
}

module.exports = { gatherParams };