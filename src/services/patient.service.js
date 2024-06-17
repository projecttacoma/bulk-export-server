const {
  findResourceById,
  findResourcesWithQuery,
  createResource,
  updateResource
} = require('../util/mongo.controller');
const { v4: uuidv4 } = require('uuid');

/**
 * Result of sending a GET request to [base]/Patient/[id].
 * Searches for a Patient resource with the passed in id
 * @param {Object} request the request object passed in by the user
 * @param {Object} reply the response object
 */
const patientSearchById = async (request, reply) => {
  const result = await findResourceById(request.params.patientId, 'Patient');
  if (!result) {
    reply.code(404).send(new Error(`The requested patient ${request.params.patientId} was not found.`));
  }
  return result;
};

/**
 * Result of sending a GET request to [base]/Patient to find all available Patients.
 * @param {Object} request the request object passed in by the user
 * @param {Object} reply the response object
 */
const patientSearch = async (request, reply) => {
  const result = await findResourcesWithQuery({}, 'Patient');
  if (!result.length > 0) {
    reply.code(404).send(new Error('No Patient resources were found on the server'));
  }
  return result;
};

/**
 * Creates a Patient object and generates an id for it regardless of the id passed in.
 * @param {Object} request the request object passed in by the user
 * @param {Object} reply the response object
 */
const patientCreate = async (request, reply) => {
  const data = request.body;
  data['id'] = uuidv4();
  reply.code(201);
  return createResource(data, 'Patient');
};

/**
 * Updates the Patient resource with the passed in id or creates a new document if
 * no document with passed id is found.
 * @param {Object} request the request object passed in by the user
 * @param {Object} reply the response object
 */
const patientUpdate = async (request, reply) => {
  const data = request.body;
  if (data.id !== request.params.patientId) {
    reply.code(400).send(new Error('Argument id must match request body id for PUT request'));
  }
  return updateResource(request.params.patientId, data, 'Patient');
};

module.exports = {
  patientSearchById,
  patientSearch,
  patientCreate,
  patientUpdate
};
