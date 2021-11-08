const build = require('../src/server/app');
const { exportToNDJson } = require('../src/util/exportToNDJson');
const { cleanUpDb, createTestResourceWithConnect } = require('./populateTestData');
const testPatient = require('./fixtures/testPatient.json');
const app = build();
const fs = require('fs');
const mockRequestWithType = {
  query: {
    _type: 'Patient'
  }
};
const mockRequestWithoutType = {
  id: 'mockRequestWithoutType',
  query: {}
};
const clientId = '123456';
//= ./tmp/ + type.toString(); + resourceType + clientId + '.ndjson';
//const expectedFileName = './tmp/Patient/patient123456.ndjson';

const expectedFileName = './tmp/Patient/patient.ndjson';
describe('check export logic', () => {
  beforeAll(async () => {
    await createTestResourceWithConnect(testPatient, 'Patient');
    console.log('created test resource');
  });

  beforeEach(async () => {
    await app.ready();
  });

  test('Expect folder created and export successful  when _type  parameter is present', async () => {
    exportToNDJson(clientId, mockRequestWithType);
    expect(fs.existsSync(expectedFileName)).toBe(true);
  });
  test('Expect folder created and export successful  when _type  parameter is  not present', async () => {
    exportToNDJson(clientId, mockRequestWithoutType);

    expect(fs.existsSync(expectedFileName)).toBe(true);
  });
  afterAll(async () => {
    await cleanUpDb();
  });
});
