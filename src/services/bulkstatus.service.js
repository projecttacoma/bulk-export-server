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
const { gatherParams } = require('../util/serviceUtils');
const axios = require('axios');
/** The time a client is expected to wait between bulkstatus requests in seconds*/
const RETRY_AFTER = 1;
/** The number of requests we allow inside the retry after window before throwing a 429 error */
const REQUEST_TOLERANCE = 10;

/**
 * Kicks off an $bulk-submit request to the data receiver specified in the passed parameters.
 * @param {*} request the request object passed in by the user
 * @param {*} reply the response object
 */
async function kickoffImport(request, reply) {
  const clientId = request.params.clientId;
  const bulkStatus = await getBulkExportStatus(clientId);
  if (!bulkStatus) {
    reply.code(404).send(new Error(`Could not find bulk export request with id: ${clientId}`));
  }
  if (bulkStatus.status === BULKSTATUS_COMPLETED) {
    const parameters = gatherParams(request.method, request.query, request.body, reply);
    if (parameters.bulkSubmitEndpoint) {
      const submitParameters = {
        resourceType: 'Parameters',
        parameter: [
          {
            name: 'manifestUrl',
            valueString: `${process.env.BULK_BASE_URL}/bulkstatus/${clientId}`
          },
          {
            name: 'submitter',
            valueIdentifier: {
              value: 'bulk-export-submitter'
            }
          },
          {
            name: 'submissionId',
            valueString: clientId
          },
          {
            name: 'FHIRBaseUrl',
            valueString: process.env.BULK_BASE_URL
          }
        ]
      };

      // TODO: add provenance?
      const headers = {
        accept: 'application/fhir+json',
        'content-type': 'application/fhir+json'
      };
      try {
        // on success, pass through the response
        const results = await axios.post(parameters.bulkSubmitEndpoint, submitParameters, { headers });
        reply.code(results.status).send(results.body);
      } catch (e) {
        // on fail, pass through wrapper error 400 that contains contained resource for the operationoutcome from the receiver
        let receiverOutcome;
        if (e.response.data.resourceType === 'OperationOutcome') {
          receiverOutcome = e.response.data;
        } else {
          receiverOutcome = createOperationOutcome(e.message, { issueCode: e.status, severity: 'error' });
        }
        const outcome = createOperationOutcome(
          `Import request for id ${clientId} to receiver ${parameters.bulkSubmitEndpoint} failed with the contained error.`,
          {
            issueCode: 400,
            severity: 'error'
          }
        );
        outcome.contained = [receiverOutcome];
        reply.code(400).send(outcome);
      }
    } else {
      reply.code(400).send(
        createOperationOutcome(
          'The kickoff-import endpoint requires a bulkSubmitEndpoint location be specified in the request Parameters.',
          {
            issueCode: 400,
            severity: 'error'
          }
        )
      );
    }
  } else {
    reply.code(400).send(
      createOperationOutcome(`Export request with id ${clientId} is not yet complete`, {
        issueCode: 400,
        severity: 'error'
      })
    );
  }
}

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
    const manifest = {
      transactionTime: new Date(),
      requiresAccessToken: false,
      request: bulkStatus.request,
      output: responseData,
      // When we eventually catch warnings, this will add them to the response object
      ...(bulkStatus.warnings.length === 0
        ? undefined
        : {
            error: [
              {
                type: 'OperationOutcome',
                url: `${process.env.BULK_BASE_URL}/${clientId}/OperationOutcome.ndjson`
              }
            ]
          })
    };
    if (bulkStatus.byPatient) {
      manifest.outputOrganizedBy = 'Patient';
    }
    reply.send(manifest);
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
        url: `${process.env.BULK_BASE_URL}/${clientId}/${file}`
      };
      output.push(entry);
    }
  });
  return output;
}

module.exports = { checkBulkStatus, kickoffImport };
