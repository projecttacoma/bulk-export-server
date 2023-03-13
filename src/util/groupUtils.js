const { createResource } = require('./mongo.controller');

/**
 * Creates a FHIR Group resource that represents the Patients associated with a given Measure
 * and adds it to the database
 * @param {String} measureId An id for the associated FHIR Measure to be used in the Group Id
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

module.exports = { createPatientGroupsPerMeasure }