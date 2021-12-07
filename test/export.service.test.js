const { bulkStatusSetup, cleanUpDb } = require('./populateTestData');
const { db } = require('../src/util/mongo');
const build = require('../src/server/app');
const app = build();
const supertest = require('supertest');
const queue = require('../src/resources/exportQueue');
const createJobSpy = jest.spyOn(queue, 'createJob');

// Mock export to do nothing
queue.exportToNDJson = jest.fn();
// describe('Test job properly enqueued when export kickoff called', () => {
//   beforeAll(() => {});
//   test('check job is properly enqueued as a job in Redis', async () => {
//     await queue.bulkExport();
//     expect(createJobSpy).toHaveBeenCalled();
//   });

//   afterEach(async () => {
//     await queue.testExportQueue.close();
//   });
// });

describe('Check barebones bulk export logic', () => {
  beforeEach(async () => {
    await bulkStatusSetup();
    await app.ready();
  });

  test.only('check 202 returned and content-location populated', async () => {
    await supertest(app.server)
      .get('/$export')
      .expect(202)
      .then(response => {
        expect(response.headers['content-location']).toBeDefined();
        expect(createJobSpy).toHaveBeenCalled();
      });
  });

  test('check 202 returned and content-location populated with params', async () => {
    await supertest(app.server)
      .get('/$export?_outputFormat=ndjson')
      .expect(202)
      .then(response => {
        expect(response.headers['content-location']).toBeDefined();
      });
  });

  test('check 400 returned for invalid outputFormat', async () => {
    await supertest(app.server)
      .get('/$export?_outputFormat=invalid')
      .expect(400)
      .then(response => {
        expect(JSON.parse(response.text).message).toEqual(
          'The following output format is not supported for _outputFormat param for $export: invalid'
        );
      });
  });

  test('check 400 returned for invalid type', async () => {
    await supertest(app.server)
      .get('/$export?_type=invalid')
      .expect(400)
      .then(response => {
        expect(JSON.parse(response.text).message).toEqual(
          'The following resourceTypes are not supported for _type param for $export: invalid.'
        );
      });
  });

  test('check 400 returned for unrecognized param', async () => {
    await supertest(app.server)
      .get('/$export?_unrecognizedparam=invalid')
      .expect(400)
      .then(response => {
        expect(JSON.parse(response.text).message).toEqual(
          'The following parameters are unrecognized by the server: _unrecognizedparam.'
        );
      });
  });

  test('DB is not populated when unrecognized param is in request', async () => {
    const numEntries = await db.collection('bulkExportStatuses').countDocuments({});
    await supertest(app.server)
      .get('/$export?_unrecognizedparam=invalid')
      .expect(400)
      .then(async () => {
        expect(await db.collection('bulkExportStatuses').countDocuments({})).toEqual(numEntries);
      });
  });

  afterEach(async () => {
    await cleanUpDb();
  });

  afterAll(async () => {
    await queue.close();
  });
});
