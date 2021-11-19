const { v4: uuidv4 } = require('uuid');

/**
 * Takes in error information and create an OperationOutcome to return to the user
 * @param {*} message a message to be displayed inside the OperationOutcome
 * @param {*} param1 an object containing the issueCode and severity to be copied into the OperationOutcome
 * @returns An OperationOutcome to return to the user with information about the failure
 */

function createOperationOutcome(
  message,
  {
    issueCode = 'processing', // http://hl7.org/fhir/valueset-issue-type.html
    severity = 'error' // fatal | error | warning | information
  } = {}
) {
  return {
    resourceType: 'OperationOutcome',
    id: uuidv4(),
    issue: [
      {
        severity: severity,
        code: issueCode,
        details: {
          text: message
        }
      }
    ]
  };
}

module.exports = { createOperationOutcome };
