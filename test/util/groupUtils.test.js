const testPatient = require('../fixtures/testPatient.json');
const { cleanUpDb } = require('../populateTestData');
const { createPatientGroupsPerMeasure } = require('../../src/util/groupUtils');
// import queue to close open handles after tests pass
// TODO: investigate why queues are leaving open handles in this file
const queue = require('../../src/resources/exportQueue');
describe('createPatientGroupsPerMeasure', () => {
  test('Successfully creates group containing input patient', async () => {
    const result = await createPatientGroupsPerMeasure('test-id', [testPatient.id]);
    expect(result).toEqual(true);
  });

  afterEach(async () => {
    await cleanUpDb();
  });
});

// Close export queue that is created when processing these tests
// TODO: investigate why queues are leaving open handles in this file
afterAll(async () => {
  await queue.close();
});
