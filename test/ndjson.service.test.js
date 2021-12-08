const { bulkStatusSetup, cleanUpDb, createTestResourceWithConnect } = require('./populateTestData');
const { exportToNDJson } = require('../src/util/exportToNDJson');
const build = require('../src/server/app');
const app = build();
const supertest = require('supertest');
const testPatient = require('./fixtures/testPatient.json');
// import queue to close open handles after tests pass
// TODO: investigate why queues are leaving open handles in this file
const queue = require('../src/resources/exportQueue');

describe('Test ndjson retrieval from specified url', () => {
  const clientId = '123456';
  const mockType = 'Patient';

  beforeAll(async () => {
    await bulkStatusSetup();
  });

  beforeEach(async () => {
    await app.ready();
  });
  test('Throw error for invalid url', async () => {
    await supertest(app.server)
      .get(`/INVALID/Patient.ndjson`)
      .expect(404)
      .then(response => {
        expect(JSON.parse(response.text).message).toEqual(
          'The following file path was not found: tmp/INVALID/Patient.ndjson'
        );
      });
  });

  test('Retrieve ndjson content for valid url', async () => {
    await createTestResourceWithConnect(testPatient, 'Patient');
    await exportToNDJson(clientId, mockType);
    await supertest(app.server)
      .get(`/${clientId}/Patient.ndjson`)
      .expect(200)
      .then(response => {
        expect(response.headers['content-type']).toEqual('application/ndjson+fhir');
        expect(response.body).toBeDefined();
      });
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
