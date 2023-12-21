const { createResource } = require('./mongo.controller');
const { createOperationOutcome } = require('./errorUtils');

/**
 * Creates a FHIR Group resource that represents the Patients associated with a given Measure
 * and adds it to the database
 * @param {string} measureId An id for the associated FHIR Measure to be used in the Group Id
 * @param {Array} patientIds An array of FHIR Patient ids to be added as Group members
 * @returns {Boolean} True if the Group creation succeeds, false otherwise
 */
async function createPatientGroupsPerMeasure(measureId, patientIds) {
  const group = {
    resourceType: 'Group',
    id: `${measureId}-patients`,
    type: 'person',
    actual: true,
    member: patientIds.map(pid => ({
      entity: {
        reference: `Patient/${pid}`
      }
    }))
  };
  try {
    await createResource(group, 'Group');
    return true;
  } catch (e) {
    if (e.code !== 11000) {
      console.log(e.message);
    }
    return false;
  }
}

/**
 * Verifies that all patients specified in the "patient" parameter are members of the group, for a
 * given group export. Throws a 404 error wrapped in an OperationOutcome if any patients are specified
 * that do *not* belong to the group.
 * @param {Array} patientParam array of patient references
 * @param {Object} group FHIR Group resource
 * @param {Object} reply the response object
 */
function verifyPatientsInGroup(patientParam, group, reply) {
  const unknownPatientReferences = [];

  const groupMembers = group.member.map(m => {
    return m.entity.reference;
  });

  patientParam.forEach(p => {
    if (!groupMembers.find(member => member === p.reference)) {
      unknownPatientReferences.push(p.reference);
    }
  });

  if (unknownPatientReferences.length > 0) {
    const errorMessage = `The following patient ids are not members of the group ${
      group.id
    }: ${unknownPatientReferences.join(', ')}`;
    reply.code(404).send(createOperationOutcome(errorMessage, { issueCode: 404, severity: 'error' }));
  }
  return false;
}

module.exports = { createPatientGroupsPerMeasure, verifyPatientsInGroup };
