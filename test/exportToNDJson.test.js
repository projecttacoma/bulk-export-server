const build = require('../src/server/app');
const { exportToNDJson } = require('../src/util/exportToNDJson');
const { cleanUpDb, createTestResourceWithConnect } = require('./populateTestData');
const testPatient = require('./fixtures/testPatient.json');
const testEncounter = require('./fixtures/testEncounter.json');

const testServiceRequest = require('./fixtures/testServiceRequest.json');
const app = build();
const fs = require('fs');
// import queue to close open handles after tests pass
// TODO: investigate why queues are leaving open handles in this file
const queue = require('../src/resources/exportQueue');
const mockType = 'Patient';

const expectedFileName = './tmp/123456/Patient.ndjson';
const clientId = '123456';
const mockTypeFilter = 'Patient?type:=http://example.com/fhir/ValueSet/test';

const complexMockTypeFilter =
  'Patient?type:=http://example.com/fhir/ValueSet/test,Encounter?type:=http://example.com/fhir/ValueSet/test2,ServiceRequest?code:=http://example.com/fhir/ValueSet/test';
const expectedFileNameEncounter = './tmp/123456/Encounter.ndjson';
const expectedFileNameServiceRequest = './tmp/123456/ServiceRequest.ndjson';
const typeFilterWOValueSet = 'Procedure?type:=http';
const typeFilterWithInvalidType = 'Dog?type:=http://example.com/fhir/ValueSet/test';
const expectedFileNameInvalidType = './tmp/123456/Dog.ndjson';
const expectedFileNameWOValueSet = './tmp/123456/Procedure.ndjson';
describe('check export logic', () => {
  beforeAll(async () => {
    await createTestResourceWithConnect(testPatient, 'Patient');
    await createTestResourceWithConnect(testEncounter, 'Encounter');

    await createTestResourceWithConnect(testServiceRequest, 'ServiceRequest');
    console.log('created test resource');
  });

  beforeEach(async () => {
    await app.ready();
  });

  test('Expect folder created and export successful when _type  parameter is retrieved from request', async () => {
    await exportToNDJson(clientId, mockType);
    expect(fs.existsSync(expectedFileName)).toBe(true);
  });
  test('Expect folder created and export successful when _type parameter is not present in request', async () => {
    await exportToNDJson(clientId);
    expect(fs.existsSync(expectedFileName)).toBe(true);
  });

  test('Expect folder created and export successful when _typeFilter  parameter is retrieved from request', async () => {
    await exportToNDJson(clientId, mockType, mockTypeFilter);
    expect(fs.existsSync(expectedFileName)).toBe(true);
  });
  test('Expect folder created and export successful when _typeFilter  parameter is retrieved from request', async () => {
    await exportToNDJson(clientId, mockType, complexMockTypeFilter);
    expect(fs.existsSync(expectedFileName)).toBe(true);
    expect(fs.existsSync(expectedFileNameEncounter)).toBe(true);
    expect(fs.existsSync(expectedFileNameServiceRequest)).toBe(true);
  });
  test('Expect folder created and export to fail when _typeFilter parameter is retrieved from request and contains an invalid param', async () => {
    await exportToNDJson(clientId, mockType, typeFilterWithInvalidType);
    expect(fs.existsSync(expectedFileNameInvalidType)).toBe(false);
  });
  test('Expect folder created and export to fail when _typeFilter  parameter is retrieved from request but the value set is invalid', async () => {
    await exportToNDJson(clientId, mockType, typeFilterWOValueSet);
    expect(fs.existsSync(expectedFileNameWOValueSet)).toBe(false);
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
