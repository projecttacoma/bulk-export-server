const { bulkStatusSetup, cleanUpDb, createTestResource } = require('./populateTestData');
const build = require('../src/server/app');
const app = build();
const supertest = require('supertest');
const testPatient = require('./fixtures/testPatient.json');
const fs = require('fs');
describe('checkBulkStatus logic', () => {
  const clientId = 'testClient';

  beforeAll(async () => {
    await bulkStatusSetup();
    fs.mkdirSync(`tmp/${clientId}`, { recursive: true });
    // create blank file and wrap in fs.closeSync
    // to avoid file descriptor return
    fs.closeSync(fs.openSync(`tmp/${clientId}/Patient.ndjson`, 'w'));
  });

  beforeEach(async () => {
    await app.ready();
  });
  test('check 202 returned for pending request', async () => {
    await supertest(app.server)
      .get('/bulkstatus/PENDING_REQUEST')
      .expect(202)
      .then(response => {
        expect(response.headers['x-progress']).toEqual('Exporting files');
        expect(response.headers['retry-after']).toEqual('120');
      });
  });
  test('check 200 returned for completed request', async () => {
    await createTestResource(testPatient, 'Patient');
    await supertest(app.server)
      .get(`/bulkstatus/${clientId}`)
      .expect(200)
      .then(response => {
        expect(response.headers.expires).toBeDefined();
        expect(response.headers['content-type']).toEqual('application/json; charset=utf-8');
        expect(response.body.outcome).toEqual([
          { type: 'Patient.ndjson', url: 'http://localhost:3000/testClient/Patient.ndjson' }
        ]);
      });
  });
  test('check 500 and error returned for failed request with known error', async () => {
    await supertest(app.server)
      .get('/bulkstatus/KNOWN_ERROR_REQUEST')
      .expect(500)
      .then(response => {
        expect(response.headers['content-type']).toEqual('application/json; charset=utf-8');
        expect(JSON.parse(response.text).message).toEqual('Known Error Occurred!');
      });
  });
  test('check 500 and generic error returned for request with unknown error', async () => {
    await supertest(app.server)
      .get('/bulkstatus/UNKNOWN_ERROR_REQUEST')
      .expect(500)
      .then(response => {
        expect(response.headers['content-type']).toEqual('application/json; charset=utf-8');
        expect(JSON.parse(response.text).message).toEqual(
          'An unknown error occurred during bulk export with id: UNKNOWN_ERROR_REQUEST'
        );
      });
  });
  test('check 404 error returned for request with unknown ID', async () => {
    await supertest(app.server)
      .get('/bulkstatus/INVALID_ID')
      .expect(404)
      .then(response => {
        expect(JSON.parse(response.text).message).toEqual('Could not find bulk export request with id: INVALID_ID');
      });
  });

  afterAll(async () => {
    await cleanUpDb();
    fs.rmSync(`tmp/${clientId}`, { recursive: true, force: true });
  });
});
