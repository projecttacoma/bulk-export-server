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

const expectedFileName = './tmp/patient123456.ndjson';
const clientId = '123456';
describe('check export logic', () => {
  beforeAll(async () => {
    await createTestResourceWithConnect(testPatient, 'Patient');
    console.log('created test resource');
  });

  beforeEach(async () => {
    await app.ready();
  });

  test('Expect folder created and export successful  when _type  parameter is present', async () => {
    await exportToNDJson(clientId, mockRequestWithType);
    expect(fs.existsSync(expectedFileName)).toBe(true);
  });
  test('Expect folder created and export successful  when _type  parameter is  not present', async () => {
    await exportToNDJson(clientId, mockRequestWithoutType);

    expect(fs.existsSync(expectedFileName)).toBe(true);
  });
  afterAll(async () => {
    await cleanUpDb();
  });
});
