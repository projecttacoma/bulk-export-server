const { bulkStatusSetup, cleanUpDb, createTestResource } = require('../populateTestData');
const build = require('../../src/server/app');
const app = build();
const supertest = require('supertest');
const testPatient = require('../fixtures/testPatient.json');
const fs = require('fs');
// import queue to close open handles after tests pass
// TODO: investigate why queues are leaving open handles in this file
const queue = require('../../src/resources/exportQueue');
describe('checkBulkStatus logic', () => {
  const clientId = 'testClient';
  beforeAll(async () => {
    await bulkStatusSetup();
    fs.mkdirSync(`tmp/${clientId}`, { recursive: true });
    fs.mkdirSync(`tmp/REQUEST_WITH_WARNINGS`, { recursive: true });

    // create blank file and wrap in fs.closeSync
    // to avoid file descriptor return
    fs.closeSync(fs.openSync(`tmp/${clientId}/Patient.ndjson`, 'w'));
    fs.closeSync(fs.openSync(`tmp/REQUEST_WITH_WARNINGS/Patient.ndjson`, 'w'));
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
        expect(response.headers['retry-after']).toEqual('1');
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
        expect(response.body.output).toEqual([
          { type: 'Patient', url: `http://localhost:3000/${clientId}/Patient.ndjson` }
        ]);
      });
  });
  test('check 500 and error returned for failed request with known error', async () => {
    await supertest(app.server)
      .get('/bulkstatus/KNOWN_ERROR_REQUEST')
      .expect(500)
      .then(response => {
        expect(response.headers['content-type']).toEqual('application/json; charset=utf-8');
        expect(response.body.resourceType).toEqual('OperationOutcome');
        expect(response.body.issue[0].code).toEqual('processing');
        expect(response.body.issue[0].details.text).toEqual('Known Error Occurred!');
      });
  });
  test('check 500 and generic error returned for request with unknown error', async () => {
    await supertest(app.server)
      .get('/bulkstatus/UNKNOWN_ERROR_REQUEST')
      .expect(500)
      .then(response => {
        expect(response.headers['content-type']).toEqual('application/json; charset=utf-8');
        expect(response.body.resourceType).toEqual('OperationOutcome');
        expect(response.body.issue[0].code).toEqual('processing');
        expect(response.body.issue[0].details.text).toEqual(
          'An unknown error occurred during bulk export with id: UNKNOWN_ERROR_REQUEST'
        );
      });
  });
  test('check 200 returned with warnings for completed request with warnings', async () => {
    await supertest(app.server)
      .get(`/bulkstatus/REQUEST_WITH_WARNINGS`)
      .expect(200)
      .then(response => {
        expect(response.headers.expires).toBeDefined();
        expect(response.headers['content-type']).toEqual('application/json; charset=utf-8');
        expect(response.body.output).toEqual([
          { type: 'Patient', url: `http://localhost:3000/REQUEST_WITH_WARNINGS/Patient.ndjson` }
        ]);
        expect(response.body.error).toEqual([
          {
            type: 'OperationOutcome',
            url: `${process.env.BULK_BASE_URL}/REQUEST_WITH_WARNINGS/OperationOutcome.ndjson`
          }
        ]);
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
  test('check 429 error returned for spamming requests, then 202 after waiting', async () => {
    let response;
    for (let i = 0; i <= 10; i++) {
      response = await supertest(app.server).get('/bulkstatus/PENDING_REQUEST');
    }
    expect(response.statusCode).toEqual(429);
    await new Promise(resolve => setTimeout(resolve, 1000));
    response = await supertest(app.server).get('/bulkstatus/PENDING_REQUEST');
    expect(response.statusCode).toEqual(202);
  });
  test('check 202 returned for spamming requests appropriately slowly', async () => {
    for (let i = 0; i < 10; i++) {
      await supertest(app.server).get('/bulkstatus/PENDING_REQUEST');
    }
    await new Promise(resolve => setTimeout(resolve, 1000));
    const response = await supertest(app.server).get('/bulkstatus/PENDING_REQUEST');
    expect(response.statusCode).toEqual(202);
  });

  afterAll(async () => {
    await cleanUpDb();
    fs.rmSync(`tmp/${clientId}`, { recursive: true, force: true });
    fs.rmSync(`tmp/REQUEST_WITH_WARNINGS`, { recursive: true, force: true });
  });

  // Close export queue that is created when processing these tests
  // TODO: investigate why queues are leaving open handles in this file
  afterEach(async () => {
    await queue.close();
  });
});
