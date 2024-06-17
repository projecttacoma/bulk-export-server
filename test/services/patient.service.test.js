const build = require('../../src/server/app');
const app = build();
const { client } = require('../../src/util/mongo');
const supertest = require('supertest');
const { cleanUpDb, createTestResource } = require('../populateTestData');
const testPatient = require('../fixtures/testPatient.json');
const updatedTestPatient = require('../fixtures/updatedTestPatient.json');
const queue = require('../../src/resources/exportQueue');

const TEST_PATIENT_ID = 'testPatient';
const INVALID_PATIENT_ID = 'INVALID';

describe('CRUD operations for Patient resource', () => {
  beforeEach(async () => {
    await client.connect();
    await app.ready();
  });
  test('test create returns 201', async () => {
    await supertest(app.server).post('/Patient').send(testPatient).expect(201);
  });

  test('test searchById should return 200 when patient is in db', async () => {
    await createTestResource(testPatient, 'Patient');
    await supertest(app.server)
      .get(`/Patient/${TEST_PATIENT_ID}`)
      .expect(200)
      .then(response => {
        expect(response.body.id).toEqual(TEST_PATIENT_ID);
      });
  });

  test('test searchById should return 404 when patient is not in db', async () => {
    await supertest(app.server)
      .get(`/Patient/${INVALID_PATIENT_ID}`)
      .expect(404)
      .then(response => {
        expect(JSON.parse(response.text).message).toEqual('The requested patient INVALID was not found.');
      });
  });

  test('test search should return 200 when patients are in the db', async () => {
    await createTestResource(testPatient, 'Patient');
    await supertest(app.server)
      .get(`/Patient`)
      .expect(200)
      .then(response => {
        expect(JSON.parse(response.text).length).toEqual(1);
      });
  });

  test('test search should return 404 if no patients are in the db', async () => {
    await supertest(app.server)
      .get(`/Patient`)
      .expect(404)
      .then(response => {
        expect(JSON.parse(response.text).message).toEqual('No Patient resources were found on the server');
      });
  });

  test('test update returns 200 when patient is in db', async () => {
    await createTestResource(testPatient, 'Patient');
    await supertest(app.server).put(`/Patient/${TEST_PATIENT_ID}`).send(updatedTestPatient).expect(200);
  });

  test('test update returns 201 when patient is not in db', async () => {
    await supertest(app.server).put(`/Patient/${TEST_PATIENT_ID}`).send(updatedTestPatient).expect(200);
  });

  afterEach(async () => {
    await cleanUpDb();
    await queue.close();
  });
});
