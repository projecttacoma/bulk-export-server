const build = require('../../src/server/app');
const app = build();
const { client } = require('../../src/util/mongo');
const supertest = require('supertest');
const { cleanUpDb, createTestResource } = require('../populateTestData');
const testGroup = require('../fixtures/testGroup.json');
const updatedTestGroup = require('../fixtures/updatedTestGroup.json');
// import queue to close open handles after tests pass
// TODO: investigate why queues are leaving open handles in this file
const queue = require('../../src/resources/exportQueue');

const TEST_GROUP_ID = 'testGroup';
const INVALID_GROUP_ID = 'INVALID';

describe('CRUD operations for Group resource', () => {
  beforeEach(async () => {
    await client.connect();
    await app.ready();
  });
  test('test create returns 201', async () => {
    await supertest(app.server).post('/Group').send(testGroup).expect(201);
  });

  test('test searchById should return 200 when group is in db', async () => {
    await createTestResource(testGroup, 'Group');
    await supertest(app.server)
      .get(`/Group/${TEST_GROUP_ID}`)
      .expect(200)
      .then(response => {
        expect(response.body.id).toEqual(TEST_GROUP_ID);
      });
  });

  test('test searchById should return 404 when group is not in db', async () => {
    await supertest(app.server)
      .get(`/Group/${INVALID_GROUP_ID}`)
      .expect(404)
      .then(response => {
        expect(JSON.parse(response.text).message).toEqual('The requested group INVALID was not found.');
      });
  });

  test('test search should return 200 when groups are in the db', async () => {
    await createTestResource(testGroup, 'Group');
    await supertest(app.server)
      .get(`/Group`)
      .expect(200)
      .then(response => {
        expect(JSON.parse(response.text).length).toEqual(1);
      });
  });

  test('test search should return 404 if no groups are in the db', async () => {
    await supertest(app.server)
      .get(`/Group`)
      .expect(404)
      .then(response => {
        expect(JSON.parse(response.text).message).toEqual('No Group resources were found on the server');
      });
  });

  test('test update returns 200 when group is in db', async () => {
    await createTestResource(testGroup, 'Group');
    await supertest(app.server).put(`/Group/${TEST_GROUP_ID}`).send(updatedTestGroup).expect(200);
  });

  test('test update returns 201 when group is not in db', async () => {
    await supertest(app.server).put(`/Group/${TEST_GROUP_ID}`).send(updatedTestGroup).expect(200);
  });

  afterEach(async () => {
    await cleanUpDb();
    await queue.close();
  });
});
