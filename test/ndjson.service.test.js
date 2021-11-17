const { bulkStatusSetup, cleanUpDb, createTestResourceWithConnect } = require('./populateTestData');
const build = require('../src/server/app');
const app = build();
const supertest = require('supertest');
const testPatient = require('./fixtures/testPatient.json');

describe.skip('Test ndjson retrieval from specified url', () => {
  const clientId = '123456';

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
});
