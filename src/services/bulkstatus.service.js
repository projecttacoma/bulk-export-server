const {
  getBulkExportStatus,
  BULKSTATUS_COMPLETED,
  BULKSTATUS_INPROGRESS,
  resetFirstValidRequest,
  updateNumberOfRequestsInWindow
} = require('../util/mongo.controller');
const fs = require('fs');
const path = require('path');
const { createOperationOutcome } = require('../util/errorUtils');
/** The time a client is expected to wait between bulkstatus requests in seconds*/
const RETRY_AFTER = 1;
/** The number of requests we allow inside the retry after window before throwing a 429 error */
const REQUEST_TOLERANCE = 10;

/**
 * Checks the status of the bulk export request.
 * @param {*} request the request object passed in by the user
 * @param {*} reply the response object
 */
async function checkBulkStatus(request, reply) {
  const clientId = request.params.clientId;
  const bulkStatus = await getBulkExportStatus(clientId);
  if (!bulkStatus) {
    reply.code(404).send(new Error(`Could not find bulk export request with id: ${clientId}`));
  }
  if (bulkStatus.status === BULKSTATUS_INPROGRESS) {
    const { timeOfFirstValidRequest, numberOfRequestsInWindow } = bulkStatus;
    const curTime = new Date().getTime();
    if (!timeOfFirstValidRequest || checkTimeIsOutsideWindow(curTime, timeOfFirstValidRequest)) {
      await resetFirstValidRequest(clientId, curTime);
      reply.code(202);
      reply.header('X-Progress', 'Exporting files');
    } else if (numberOfRequestsInWindow > REQUEST_TOLERANCE) {
      reply.code(429);
    } else {
      await updateNumberOfRequestsInWindow(clientId, numberOfRequestsInWindow + 1);
      reply.code(202);
      reply.header('X-Progress', 'Exporting files');
    }
    reply.header('Retry-After', RETRY_AFTER).send();
  } else if (bulkStatus.status === BULKSTATUS_COMPLETED) {
    reply.code(200).header('Expires', 'EXAMPLE_EXPIRATION_DATE');
    const responseData = await getNDJsonURLs(reply, clientId);
    reply.send({
      transactionTime: new Date(),
      requiresAccessToken: false,
      output: responseData,
      // When we eventually catch warnings, this will add them to the response object
      ...(bulkStatus.warnings.length === 0
        ? undefined
        : {
            error: [
              {
                type: 'OperationOutcome',
                url: `${process.env.PUBLIC_BULK_SERVER}/${clientId}/OperationOutcome.ndjson`
              }
            ]
          })
    });
  } else {
    reply
      .code(bulkStatus.error?.code || 500)
      .send(
        createOperationOutcome(
          bulkStatus.error?.message || `An unknown error occurred during bulk export with id: ${clientId}`
        )
      );
  }
}

/**
 * Returns true if the current time is later than the first valid request time plus the retry after buffer
 * @param {Object} curTime A date object signifying the current time
 * @param {Object} firstValidRequest A date object signifying the time of the first valid request
 * @returns {boolean} true if the current time is later than the first valid request time plus the retry after buffer, false otherwise
 */
function checkTimeIsOutsideWindow(curTime, firstValidRequest) {
  const expectedTime = new Date(firstValidRequest);
  expectedTime.setSeconds(expectedTime.getSeconds() + RETRY_AFTER);
  return curTime >= expectedTime;
}

/**
 * Gathers the ndjson URLs for all the desired resources for
 * the specified clientId.
 * @param {string} clientId client Id from request params
 * @param {*} reply the response object
 * @returns object of all the types and corresponding URLs to
 * the ndjson content
 */
async function getNDJsonURLs(reply, clientId) {
  let files;
  try {
    files = fs.readdirSync(`tmp/${clientId}`);
  } catch (e) {
    reply
      .code(500)
      .send(
        createOperationOutcome(
          e.message || `An error occurred when trying to retrieve files from the ${clientId} directory`
        )
      );
  }
  const output = [];
  files.forEach(file => {
    if (file !== 'OperationOutcome.ndjson') {
      const entry = {
        type: path.basename(file, '.ndjson'),
        url: `${process.env.PUBLIC_BULK_SERVER}/${clientId}/${file}`
      };
      output.push(entry);
    }
  });
  return output;
}

module.exports = { checkBulkStatus };
