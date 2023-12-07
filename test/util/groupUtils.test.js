const testPatient = require('../fixtures/testPatient.json');
const { createPatientGroupsPerMeasure } = require('../../src/util/groupUtils');

describe('createPatientGroupsPerMeasure', () => {
  test('Successfully creates group containing input patient', async () => {
    const result = await createPatientGroupsPerMeasure('test-id', [testPatient.id]);
    expect(result).toEqual(true);
  });
});
