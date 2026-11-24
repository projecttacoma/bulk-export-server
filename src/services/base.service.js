const QueryBuilder = require('@bluehalo/fhir-qb');
const { getSearchParameters } = require('@projecttacoma/node-fhir-server-core');
const { findResourceById, findResourcesWithAggregation } = require('../util/mongo.controller');
const { createSearchsetBundle } = require('../util/bundleUtils');
const { createOperationOutcome } = require('../util/errorUtils');

/**
 * Query Builder Parameter Definitions for all resources
 */
const GLOBAL_PARAMETER_DEFINITIONS = {
  _id: {
    type: 'token',
    fhirtype: 'token',
    xpath: 'Resource.id',
    definition: 'http://hl7.org/fhir/SearchParameter/Resource-id',
    description: 'Logical id of this artifact',
    modifier: 'missing,text,not,in,not-in,below,above,ofType'
  },
  _lastUpdated: {
    type: 'date',
    fhirtype: 'date',
    xpath: 'Resource.meta.lastUpdated',
    definition: 'http://hl7.org/fhir/SearchParameter/Resource-lastUpdated',
    description: 'When the resource version last changed',
    modifier: 'missing'
  },
  _tag: {
    type: 'token',
    fhirtype: 'token',
    xpath: 'Resource.meta.tag',
    definition: 'http://hl7.org/fhir/SearchParameter/Resource-tag',
    description: 'Tags applied to this resource',
    modifier: 'missing,text,not,in,not-in,below,above,ofType'
  },
  _profile: {
    type: 'token',
    fhirtype: 'token',
    xpath: 'Resource.meta.profile',
    definition: 'http://hl7.org/fhir/SearchParameter/Resource-profile',
    description: 'Profiles this resource claims to conform to',
    modifier: 'missing,type,identifier'
  },
  _security: {
    type: 'token',
    fhirtype: 'token',
    xpath: 'Resource.meta.security',
    definition: 'http://hl7.org/fhir/SearchParameter/Resource-security',
    description: 'Security Labels applied to this resource',
    modifier: 'missing,text,not,in,not-in,below,above,ofType'
  },
  identifier: {
    type: 'token',
    fhirtype: 'Identifier',
    xpath: 'Resource.identifier'
  },
  url: {
    type: 'token',
    fhirtype: 'uri',
    xpath: 'Resource.url'
  }
};

const qb = new QueryBuilder({
  globalParameterDefinitions: GLOBAL_PARAMETER_DEFINITIONS,
  implementationParameters: { archivedParamPath: '_isArchived' }
});

/**
 * Searches for the object of the requested type with the requested id
 * @param {string} id The id of the desired resource
 * @param {string} resourceType String which signifies which collection to search for
 * @param {Object} reply The Fastify reply object used to send an OperationOutcome
 * @returns {Object} The object with the desired id, or an OperationOutcome response
 */
const baseSearchById = async (id, resourceType, reply) => {
  reply.log.debug(`${resourceType} >>> read`);
  reply.log.debug(`Request args: ${JSON.stringify({ id })}`);
  const result = await findResourceById(id, resourceType);
  if (!result) {
    return reply
      .code(404)
      .type('application/fhir+json')
      .send(
        createOperationOutcome(`No resource found in collection: ${resourceType}, with: id ${id}`, {
          issueCode: 'ResourceNotFound'
        })
      );
  }
  return result;
};

/**
 * Searches using query parameters.
 * @param {Object} req The Fastify request object. This is used by the query builder.
 * @param {string} resourceType The resource type we are searching on.
 * @param {Object} reply The Fastify reply object used to send an OperationOutcome.
 * @param {Object} paramDefs Optional parameter definitions for the specific resource types. Specific
 *                      resource services should call this and pass along supported params
 * @returns {Object} Search set result bundle or an OperationOutcome response
 */
const baseSearch = async (req, resourceType, reply, paramDefs) => {
  req.log.debug(`${resourceType} >>> search`);
  req.log.debug(`Request args: ${JSON.stringify(req.query)}`);
  req.log.debug(`Request headers: ${JSON.stringify(req.headers)}`);
  req.log.debug(`Request body: ${JSON.stringify(req.body)}`);
  req.log.debug(`Passed in paramDefs: ${JSON.stringify(paramDefs)}`);

  // Represents search params retrieved from fhir spec, or custom params specified by resource service
  let searchParams;

  if (!paramDefs) {
    searchParams = {};
    const searchParameterList = getSearchParameters(resourceType, '4_0_1');
    searchParameterList.forEach(paramDef => {
      searchParams[paramDef.name] = paramDef;
    });
  } else {
    searchParams = paramDefs;
  }

  // wipe out params so route arguments do not break the query building
  req.params = {};

  // build result bundle. default to an empty result
  const searchBundle = createSearchsetBundle([]);
  // build the aggregation query
  req.log.debug('Building search query');
  const filter = qb.buildSearchQuery({ req: req, includeArchived: true, parameterDefinitions: searchParams });
  // if the query builder was able to build a query actually execute it.
  if (filter.query) {
    req.log.debug(`Executing aggregation search over ${resourceType}s using query: ${JSON.stringify(filter.query)}`);
    // grab the results from aggregation. returns matching resources without pagination metadata
    const results = await findResourcesWithAggregation(filter.query, resourceType, { _id: 0 });

    // If this is empty, there are no results.
    if (results.length) {
      // create entries for each of the resulting resources
      const resultEntries = results.map(result => ({
        fullUrl: new URL(`${result.resourceType}/${result.id}`, `${req.protocol}://${req.headers.host}/`).toString(),
        resource: result
      }));
      searchBundle.total = results.length;
      searchBundle.entry = resultEntries;
    }
  } else {
    // If there were issues with query building, send an OperationOutcome. Use the provided error if possible.
    const errorMessage = filter.errors[0] ? filter.errors[0].message : 'Issue parsing parameters.';
    return reply
      .code(400)
      .type('application/fhir+json')
      .send(createOperationOutcome(errorMessage, { issueCode: 'BadRequest' }));
  }
  return searchBundle;
};

module.exports = { baseSearchById, baseSearch };
