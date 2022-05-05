const {
  findResourceById,
  findResourcesWithQuery,
  createResource,
  updateResource
} = require('../util/mongo.controller');
const { v4: uuidv4 } = require('uuid');

/**
 * Result of sending a GET request to [base]/Group/[id].
 * Searches for a Group resource with the passed in id
 * @param {Object} request the request object passed in by the user
 * @param {Object} reply the response object
 */
const groupSearchById = async (request, reply) => {
  const result = await findResourceById(request.params.groupId, 'Group');
  if (!result) {
    reply.code(404).send(new Error(`The requested group ${request.params.groupId} was not found.`));
  }
  return result;
};

/**
 * Result of sending a GET request to [base]/Group to find all available Groups.
 * Searches for a Group resource with the passed in id
 * @param {Object} request the request object passed in by the user
 * @param {Object} reply the response object
 */
const groupSearch = async (request, reply) => {
  const result = await findResourcesWithQuery({}, 'Group');
  if (!result.length > 0) {
    reply.code(404).send(new Error('No Group resources were found on the server'));
  }
  return result;
};

/**
 * Creates an object and generates an id for it regardless of the id passed in
 * @param {Object} request the request object passed in by the user
 * @param {Object} reply the response object
 */
const groupCreate = async request => {
  const data = request.body;
  data['id'] = uuidv4();
  return createResource(data, 'Group');
};

/**
 * Updates the Group resource with the passed in id or creates a new document if
 * no document with passed id is found
 * @param {Object} request the request object passed in by the user
 * @param {Object} reply the response object
 */
const groupUpdate = async (request, reply) => {
  const data = request.body;
  if (data.id !== request.params.groupId) {
    reply.code(400).send(new Error('Argument id must match request body id for PUT request'));
  }
  return updateResource(request.params.groupId, data, 'Group');
};

module.exports = {
  groupSearchById,
  groupSearch,
  groupCreate,
  groupUpdate
};
