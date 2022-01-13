const { db } = require('./mongo');
const { v4: uuidv4 } = require('uuid');

// constants for bulk export status strings
const BULKSTATUS_INPROGRESS = 'In Progress';
const BULKSTATUS_COMPLETED = 'Completed';
const BUlKSTATUS_FAILED = 'Failed';

/**
 * creates a new document in the specified collection
 * @param {*} data the data of the document to be created
 * @param {*} resourceType type of desired resource, signifies collection resource is stored in
 * @returns an object with the id of the created document
 */
const createResource = async (data, resourceType) => {
  const collection = db.collection(resourceType);
  await collection.insertOne(data);
  return { id: data.id };
};

/**
 * searches the database for the desired resource and returns the data
 * @param {*} id id of desired resource
 * @param {*} resourceType type of desired resource, signifies collection resource is stored in
 * @returns the data of the found document
 */
const findResourceById = async (id, resourceType) => {
  const collection = db.collection(resourceType);
  return collection.findOne({ id: id });
};

/**
 * searches the database for the one resource based on a mongo query and returns the data
 * @param {Object} query the mongo query to use
 * @param {string} resourceType type of desired resource, signifies collection resource is stored in
 * @returns the data of the found document
 */
const findOneResourceWithQuery = async (query, resourceType) => {
  const collection = db.collection(resourceType);
  return collection.findOne(query);
};

const findResourcesWithQuery = async (query, resourceType) => {
  const collection = db.collection(resourceType);
  return (await collection.find(query)).toArray();
};

/**
 * searches for a document and updates it if found, creates it if not
 * @param {*} id id of resource to be updated
 * @param {*} data the updated data to add to/edit in the document
 * @param {*} resourceType the collection the document is in
 * @returns the id of the updated/created document
 */
const updateResource = async (id, data, resourceType) => {
  const collection = db.collection(resourceType);

  const results = await collection.findOneAndUpdate({ id: id }, { $set: data }, { upsert: true });

  // If the document cannot be created with the passed id, Mongo will throw an error
  // before here, so should be ok to just return the passed id
  if (results.value === null) {
    // null value indicates a newly created document
    return { id: id, created: true };
  }

  // value being present indicates an update, so set created flag to false
  return { id: results.value.id, created: false };
};

/**
 * searches the database for the desired resource and removes it from the db
 * @param {*} id id of resource to be removed
 * @param {*} resourceType type of desired resource, signifies collection resource is stored in
 * @returns an object containing deletedCount: the number of documents deleted
 */
const removeResource = async (id, resourceType) => {
  const collection = db.collection(resourceType);
  return collection.deleteOne({ id: id });
};

/**
 * Run an aggregation query on the database.
 * @param {*[]} query Mongo aggregation pipeline array.
 * @param {*} resourceType The resource type (collection) to aggregate on.
 * @returns Array promise of results.
 */
const findResourcesWithAggregation = async (query, resourceType) => {
  const collection = db.collection(resourceType);
  return (await collection.aggregate(query)).toArray();
};

/**
 * Called as a result of export request. Adds a new clientId to db
 * which can be queried to get updates on the status of the bulk export
 * @returns the id of the inserted client
 */
const addPendingBulkExportRequest = async () => {
  const collection = db.collection('bulkExportStatuses');
  const clientId = uuidv4();
  const bulkExportClient = {
    id: clientId,
    status: BULKSTATUS_INPROGRESS,
    numberOfRequestsInWindow: 0,
    timeOfFirstValidRequest: null,
    error: {},
    warnings: []
  };
  await collection.insertOne(bulkExportClient);
  return clientId;
};

/**
 * Wrapper for the findResourceById function that only searches bulkExportStatuses db
 * @param {string} clientId The id signifying the bulk status request
 * @returns The bulkstatus entry for the passed in clientId
 */
const getBulkExportStatus = async clientId => {
  const status = await findResourceById(clientId, 'bulkExportStatuses');
  return status;
};

/**
 * Wrapper for the updateResource function that updates the bulk status
 * @param {*} clientId The id signifying the bulk status request
 * @param {*} newStatus The status we want the object updated to
 */
const updateBulkExportStatus = async (clientId, newStatus, error = null) => {
  if (error) {
    await updateResource(clientId, { status: newStatus, error: error }, 'bulkExportStatuses');
  } else {
    await updateResource(clientId, { status: newStatus }, 'bulkExportStatuses');
  }
};

/**
 * Changes the first valid request time for tracking 429:TooManyRequests errors
 * @param {string} clientId the id of the client making the export request
 * @param {Object} timeOfFirstValidRequest a Date object storing the time of the first valid request
 */
const updateFirstValidRequest = async (clientId, timeOfFirstValidRequest) => {
  await updateResource(clientId, { timeOfFirstValidRequest }, 'bulkExportStatuses');
};

/**
 * Changes the number tracking the quantity of bulkstatus requests made within
 * @param {*} clientId the id of the client making the export request
 * @param {*} numberOfRequestsInWindow the new number of requests madde within the retry after window
 */
const updateNumberOfRequestsInWindow = async (clientId, numberOfRequestsInWindow) => {
  await updateResource(clientId, { numberOfRequestsInWindow }, 'bulkExportStatuses');
};

/**
 * Sets the time of the first valid request and resets the number of requests made within the retry after window
 * @param {*} clientId the id of the client making the export request
 * @param {*} timeOfFirstValidRequest a Date object storing the time of the first valid request
 */
const resetFirstValidRequest = async (clientId, timeOfFirstValidRequest) => {
  await updateResource(clientId, { timeOfFirstValidRequest, numberOfRequestsInWindow: 1 }, 'bulkExportStatuses');
};

/**
 * Adds a warning to the bulkstatus warning array
 * @param {*} clientId the client id for the request which threw the warning
 * @param {*} warning {message: string, code: int} an object with the message and code of the caught error
 */
const pushBulkStatusWarning = async (clientId, warning) => {
  const collection = db.collection('bulkExportStatuses');
  await collection.updateOne({ id: clientId }, { $push: { warnings: warning } });
};

module.exports = {
  findResourcesWithQuery,
  findResourceById,
  findOneResourceWithQuery,
  createResource,
  removeResource,
  updateResource,
  getBulkExportStatus,
  updateBulkExportStatus,
  findResourcesWithAggregation,
  addPendingBulkExportRequest,
  pushBulkStatusWarning,
  updateNumberOfRequestsInWindow,
  updateFirstValidRequest,
  resetFirstValidRequest,
  BULKSTATUS_INPROGRESS,
  BULKSTATUS_COMPLETED,
  BUlKSTATUS_FAILED
};
