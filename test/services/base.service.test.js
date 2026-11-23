const build = require('../../src/server/app');
const app = build();
const { client } = require('../../src/util/mongo');
const supertest = require('supertest');
const { cleanUpDb, createTestResource } = require('../populateTestData');
const testPatient = require('../fixtures/testPatient.json');
const queue = require('../../src/resources/exportQueue');

const testPatient2 = { ...testPatient, id: 'testPatient2' };

describe('base.service', () => {
  beforeEach(async () => {
    await client.connect();
    await app.ready();
    const dataToImport = [testPatient, testPatient2];
    for (const resource of dataToImport) {
      await createTestResource({ ...resource }, resource.resourceType);
    }
  });

  describe('searchById', () => {
    test('searchById with correctHeaders and the id should be in database', async () => {
      await supertest(app.server)
        .get('/Patient/testPatient')
        .set('Accept', 'application/json+fhir')
        .expect(200)
        .then(response => {
          expect(response.body.id).toEqual(testPatient.id);
        });
    });

    test('searchById when the id cannot be found in the database', async () => {
      await supertest(app.server)
        .get('/Patient/invalidID')
        .set('Accept', 'application/json+fhir')
        .expect(404)
        .then(response => {
          expect(response.body.issue[0].code).toEqual('ResourceNotFound');
          expect(response.body.issue[0].details.text).toEqual(
            'No resource found in collection: Patient, with: id invalidID'
          );
        });
    });
  });

  describe('search', () => {
    test.each(['/Patient', '/Patient/'])('search at %s with correct args and headers', async path => {
      await supertest(app.server)
        .get(path)
        .set('Accept', 'application/json+fhir')
        .expect(200)
        .then(response => {
          expect(response.body.resourceType).toEqual('Bundle');
          expect(response.body.type).toEqual('searchset');
          expect(response.body.total).toEqual(2);
          const testPatientEntry = response.body.entry.find(e => e.resource.id === testPatient.id);
          expect(testPatientEntry).toBeDefined();
          expect(testPatientEntry.resource.resourceType).toEqual('Patient');
        });
    });

    test.each(['/Patient', '/Patient/'])('search at %s with unsupported parameter', async path => {
      await supertest(app.server)
        .get(`${path}?publisher=abc`)
        .set('Accept', 'application/json+fhir')
        .expect(400)
        .then(response => {
          expect(response.body.issue[0].code).toEqual('BadRequest');
          expect(response.body.issue[0].details.text).toEqual("Unknown parameter 'publisher'");
        });
    });
  });

  afterEach(async () => {
    await cleanUpDb();
    await queue.close();
  });

  afterAll(async () => {
    await app.close();
  });
});
