const build = require('../src/server/app');
const { exportToNDJson } = require('../src/util/exportToNDJson');
const { cleanUpDb, createTestResourceWithConnect } = require('./populateTestData');
const testPatient = require('./fixtures/testPatient.json');
const app = build();
const fs = require('fs');
// import queue to close open handles after tests pass
// TODO: investigate why queues are leaving open handles in this file
const queue = require('../src/resources/exportQueue');
const mockRequestWithType = {
  query: {
    _type: 'Patient'
  }
};
const mockRequestWithoutType = {
  id: 'mockRequestWithoutType',
  query: {}
};

const expectedFileName = './tmp/123456/Patient.ndjson';
const clientId = '123456';
describe('check export logic', () => {
  beforeAll(async () => {
    await createTestResourceWithConnect(testPatient, 'Patient');
    console.log('created test resource');
  });

  beforeEach(async () => {
    await app.ready();
  });

  test('Expect folder created and export successful when _type  parameter is present', async () => {
    await exportToNDJson(clientId, mockRequestWithType);
    expect(fs.existsSync(expectedFileName)).toBe(true);
  });
  test('Expect folder created and export successful when _type  parameter is not present', async () => {
    await exportToNDJson(clientId, mockRequestWithoutType);

    expect(fs.existsSync(expectedFileName)).toBe(true);
  });

  afterAll(async () => {
    await cleanUpDb();
  });

  // Close export queue that is created when processing these tests
  // TODO: investigate why queues are leaving open handles in this file
  afterEach(async () => {
    await queue.close();
  });
});
