const { bulkStatusSetup, cleanUpDb } = require('./populateTestData');
const { db } = require('../src/util/mongo');
const build = require('../src/server/app');
const app = build();
const supertest = require('supertest');
const queue = require('./fixtures/testExportQueue');
const createJobSpy = jest.spyOn(queue.jobQueue, 'createJob');
describe('Test job properly enqueued when export kickoff called', () => {
  beforeAll(() => {
    // Mock export to do nothing
    queue.exportToNDJson = jest.fn();
  });
  test('check job is properly en  ueued as a job in Redis', async () => {
    await queue.bulkExport();
    expect(createJobSpy).toHaveBeenCalled();
  });

  afterAll(async () => {
    await queue.jobQueue.close();
  });
});

describe('Check barebones bulk export logic', () => {
  // beforeAll(async () => {
  //   // Fake export queue
  //   // const jobQueue = new Queue('export');
  //   // const exportToNDJson = async data => {
  //   //   return data;
  //   // };
  // });

  beforeEach(async () => {
    await bulkStatusSetup();
    await app.ready();
  });

  // need to add tests that make use of job queues

  test('check 202 returned and content-location populated', async () => {
    await supertest(app.server)
      .get('/$export')
      .expect(202)
      .then(response => {
        expect(response.headers['content-location']).toBeDefined();
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
});
