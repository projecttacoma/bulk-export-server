const { bulkStatusSetup, cleanUpDb, createTestResource } = require('../populateTestData');
const { db } = require('../../src/util/mongo');
const build = require('../../src/server/app');
const app = build();
const supertest = require('supertest');
const queue = require('../../src/resources/exportQueue');
const testPatient = require('../fixtures/testPatient.json');
const testEncounter = require('../fixtures/testEncounter.json');
const testGroup = require('../fixtures/testGroup.json');

// Mock export to do nothing
queue.exportToNDJson = jest.fn();
describe('Check barebones bulk export logic (success)', () => {
  beforeEach(async () => {
    await bulkStatusSetup();
    await app.ready();
  });

  test('check 202 returned and content-location populated', async () => {
    const createJobSpy = jest.spyOn(queue, 'createJob');
    await supertest(app.server)
      .get('/$export')
      .expect(202)
      .then(response => {
        expect(response.headers['content-location']).toBeDefined();
        expect(createJobSpy).toHaveBeenCalled();
      });
  });

  test('check 202 returned and content-location populated for POST request', async () => {
    const createJobSpy = jest.spyOn(queue, 'createJob');
    await supertest(app.server)
      .post('/$export')
      .expect(202)
      .then(response => {
        expect(response.headers['content-location']).toBeDefined();
        expect(createJobSpy).toHaveBeenCalled();
      });
  });

  test('check 202 returned and content-location populated with params', async () => {
    const createJobSpy = jest.spyOn(queue, 'createJob');
    await supertest(app.server)
      .get('/$export?_outputFormat=ndjson')
      .expect(202)
      .then(response => {
        expect(response.headers['content-location']).toBeDefined();
        expect(createJobSpy).toHaveBeenCalled();
      });
  });

  test('check 202 returned and content-location populated with params for POST request', async () => {
    const createJobSpy = jest.spyOn(queue, 'createJob');
    await supertest(app.server)
      .post('/$export')
      .send({
        resourceType: 'Parameters',
        parameter: [
          {
            name: '_type',
            valueString: 'Patient'
          }
        ]
      })
      .expect(202)
      .then(response => {
        expect(response.headers['content-location']).toBeDefined();
        expect(createJobSpy).toHaveBeenCalled();
      });
  });

  afterEach(async () => {
    await cleanUpDb();
  });
});

describe('Check patient-level export logic (success)', () => {
  beforeEach(async () => {
    await bulkStatusSetup();
    await app.ready();
  });

  test('check 202 returned and content-location populated', async () => {
    const createJobSpy = jest.spyOn(queue, 'createJob');
    await supertest(app.server)
      .get('/Patient/$export')
      .expect(202)
      .then(response => {
        expect(response.headers['content-location']).toBeDefined();
        expect(createJobSpy).toHaveBeenCalled();
      });
  });

  test('check 202 returned and content-location populated for POST request', async () => {
    const createJobSpy = jest.spyOn(queue, 'createJob');
    await supertest(app.server)
      .post('/Patient/$export')
      .expect(202)
      .then(response => {
        expect(response.headers['content-location']).toBeDefined();
        expect(createJobSpy).toHaveBeenCalled();
      });
  });

  test('check 202 returned and content-location populated with params', async () => {
    const createJobSpy = jest.spyOn(queue, 'createJob');
    await supertest(app.server)
      .get('/Patient/$export?_outputFormat=ndjson&_type=Patient,ServiceRequest')
      .expect(202)
      .then(response => {
        expect(response.headers['content-location']).toBeDefined();
        expect(createJobSpy).toHaveBeenCalled();
      });
  });

  test('check 202 returned and content-location populated with params for POST request', async () => {
    const createJobSpy = jest.spyOn(queue, 'createJob');
    await supertest(app.server)
      .post('/$export')
      .send({
        resourceType: 'Parameters',
        parameter: [
          {
            name: '_type',
            valueString: 'Patient'
          }
        ]
      })
      .expect(202)
      .then(response => {
        expect(response.headers['content-location']).toBeDefined();
        expect(createJobSpy).toHaveBeenCalled();
      });
  });

  test('check 202 returns and content-location populated when _type param contains resource types that are/are not included in patient compartment', async () => {
    const createJobSpy = jest.spyOn(queue, 'createJob');
    // Parameters is a supported resource that does not appear in the patient compartment
    await supertest(app.server)
      .get('/Patient/$export?_outputFormat=ndjson&_type=Patient,Parameters')
      .expect(202)
      .then(response => {
        expect(response.headers['content-location']).toBeDefined();
        expect(createJobSpy).toHaveBeenCalled();
      });
  });

  afterEach(async () => {
    await cleanUpDb();
  });
});

describe('Check group-level export logic (success)', () => {
  beforeEach(async () => {
    await bulkStatusSetup();
    await createTestResource(testPatient, 'Patient');
    await createTestResource(testEncounter, 'Encounter');
    await createTestResource(testGroup, 'Group');
    await app.ready();
  });

  test('check 202 returned and content-location populated', async () => {
    const createJobSpy = jest.spyOn(queue, 'createJob');
    await supertest(app.server)
      .get('/Group/testGroup/$export')
      .expect(202)
      .then(response => {
        expect(response.headers['content-location']).toBeDefined();
        expect(createJobSpy).toHaveBeenCalled();
      });
  });

  test('check 202 returned and content-location populated for POST request', async () => {
    const createJobSpy = jest.spyOn(queue, 'createJob');
    await supertest(app.server)
      .post('/Group/testGroup/$export')
      .expect(202)
      .then(response => {
        expect(response.headers['content-location']).toBeDefined();
        expect(createJobSpy).toHaveBeenCalled();
      });
  });

  test('check 202 returned and content-location populated with params for POST request', async () => {
    const createJobSpy = jest.spyOn(queue, 'createJob');
    await supertest(app.server)
      .post('/$export')
      .send({
        resourceType: 'Parameters',
        parameter: [
          {
            name: '_type',
            valueString: 'Patient'
          }
        ]
      })
      .expect(202)
      .then(response => {
        expect(response.headers['content-location']).toBeDefined();
        expect(createJobSpy).toHaveBeenCalled();
      });
  });

  afterEach(async () => {
    await cleanUpDb();
  });
});

describe('Check barebones bulk export logic (failure)', () => {
  beforeEach(async () => {
    await bulkStatusSetup();
    await app.ready();
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
        expect(response.body.resourceType).toEqual('OperationOutcome');
        expect(response.body.issue[0].code).toEqual(400);
        expect(response.body.issue[0].details.text).toEqual(
          'The following resourceTypes are not supported for _type param for $export: invalid.'
        );
      });
  });

  test('check 400 returned for unrecognized param', async () => {
    await supertest(app.server)
      .get('/$export?_unrecognizedparam=invalid')
      .expect(400)
      .then(response => {
        expect(response.body.resourceType).toEqual('OperationOutcome');
        expect(response.body.issue[0].code).toEqual(400);
        expect(response.body.issue[0].details.text).toEqual(
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

  test('throws 400 error when _typeFilter param is supplied with an invalid/unsupported resource type', async () => {
    await supertest(app.server)
      .get('/$export?_typeFilter=invalid?status=active')
      .expect(400)
      .then(response => {
        expect(response.body.resourceType).toEqual('OperationOutcome');
        expect(response.body.issue[0].code).toEqual(400);
        expect(response.body.issue[0].details.text).toEqual(
          'The following resourceTypes are not supported for _typeFilter param for $export: invalid.'
        );
      });
  });

  test('throws 400 error when "patient" parameter used in system-level export', async () => {
    await supertest(app.server)
      .post('/$export')
      .send({
        resourceType: 'Parameters',
        parameter: [
          {
            name: 'patient',
            valueString: 'test'
          }
        ]
      })
      .expect(400)
      .then(response => {
        expect(response.body.resourceType).toEqual('OperationOutcome');
        expect(response.body.issue[0].code).toEqual(400);
        expect(response.body.issue[0].details.text).toEqual(
          'The "patient" parameter cannot be used in a system-level export request.'
        );
      });
  });

  afterEach(async () => {
    await cleanUpDb();
  });
});

describe('Check patient-level export logic (failure)', () => {
  beforeEach(async () => {
    await bulkStatusSetup();
    await app.ready();
  });
  test('check 400 returned for invalid outputFormat', async () => {
    await supertest(app.server)
      .get('/Patient/$export?_outputFormat=invalid')
      .expect(400)
      .then(response => {
        expect(JSON.parse(response.text).message).toEqual(
          'The following output format is not supported for _outputFormat param for $export: invalid'
        );
      });
  });

  test('check 400 returned for invalid type (not a supported resource)', async () => {
    await supertest(app.server)
      .get('/Patient/$export?_type=invalid')
      .expect(400)
      .then(response => {
        expect(response.body.resourceType).toEqual('OperationOutcome');
        expect(response.body.issue[0].code).toEqual(400);
        expect(response.body.issue[0].details.text).toEqual(
          'The following resourceTypes are not supported for _type param for $export: invalid.'
        );
      });
  });

  test('check 400 returned when no resource types in _type param are included in patient compartment', async () => {
    // Parameters is a supported resource that does not appear in the patient compartment
    await supertest(app.server)
      .get('/Patient/$export?_type=Parameters')
      .expect(400)
      .then(response => {
        expect(response.body.resourceType).toEqual('OperationOutcome');
        expect(response.body.issue[0].code).toEqual(400);
        expect(response.body.issue[0].details.text).toEqual(
          'None of the provided resource types are permitted for Patient/Group export.'
        );
      });
  });

  test('check 400 returned for unrecognized param', async () => {
    await supertest(app.server)
      .get('/Patient/$export?_unrecognizedparam=invalid')
      .expect(400)
      .then(response => {
        expect(response.body.resourceType).toEqual('OperationOutcome');
        expect(response.body.issue[0].code).toEqual(400);
        expect(response.body.issue[0].details.text).toEqual(
          'The following parameters are unrecognized by the server: _unrecognizedparam.'
        );
      });
  });

  test('DB is not populated when unrecognized param is in request', async () => {
    const numEntries = await db.collection('bulkExportStatuses').countDocuments({});
    await supertest(app.server)
      .get('/Patient/$export?_unrecognizedparam=invalid')
      .expect(400)
      .then(async () => {
        expect(await db.collection('bulkExportStatuses').countDocuments({})).toEqual(numEntries);
      });
  });

  test('throws 400 error when _typeFilter param is supplied with an invalid/unsupported resource type', async () => {
    await supertest(app.server)
      .get('/Patient/$export?_typeFilter=invalid?status=active')
      .expect(400)
      .then(response => {
        expect(response.body.resourceType).toEqual('OperationOutcome');
        expect(response.body.issue[0].code).toEqual(400);
        expect(response.body.issue[0].details.text).toEqual(
          'The following resourceTypes are not supported for _typeFilter param for $export: invalid.'
        );
      });
  });

  afterEach(async () => {
    await cleanUpDb();
  });
});

describe('Check group-level export logic (failure)', () => {
  const GROUP_ID = 'testGroup';

  beforeEach(async () => {
    await bulkStatusSetup();
    await createTestResource(testPatient, 'Patient');
    await createTestResource(testEncounter, 'Encounter');
    await createTestResource(testGroup, 'Group');
    await app.ready();
  });
  test('check 400 returned for invalid outputFormat', async () => {
    await supertest(app.server)
      .get(`/Group/${GROUP_ID}/$export?_outputFormat=invalid`)
      .expect(400)
      .then(response => {
        expect(JSON.parse(response.text).message).toEqual(
          'The following output format is not supported for _outputFormat param for $export: invalid'
        );
      });
  });

  test('check 400 returned for invalid type (not a supported resource)', async () => {
    await supertest(app.server)
      .get(`/Group/${GROUP_ID}/$export?_type=invalid`)
      .expect(400)
      .then(response => {
        expect(response.body.resourceType).toEqual('OperationOutcome');
        expect(response.body.issue[0].code).toEqual(400);
        expect(response.body.issue[0].details.text).toEqual(
          'The following resourceTypes are not supported for _type param for $export: invalid.'
        );
      });
  });

  test('check 400 returned when no resource types in _type param are included in patient compartment', async () => {
    // Parameters is a supported resource that does not appear in the patient compartment
    await supertest(app.server)
      .get(`/Group/${GROUP_ID}/$export?_type=Parameters`)
      .expect(400)
      .then(response => {
        expect(response.body.resourceType).toEqual('OperationOutcome');
        expect(response.body.issue[0].code).toEqual(400);
        expect(response.body.issue[0].details.text).toEqual(
          'None of the provided resource types are permitted for Patient/Group export.'
        );
      });
  });

  test('check 400 returned for unrecognized param', async () => {
    await supertest(app.server)
      .get(`/Group/${GROUP_ID}/$export?_unrecognizedparam=invalid`)
      .expect(400)
      .then(response => {
        expect(response.body.resourceType).toEqual('OperationOutcome');
        expect(response.body.issue[0].code).toEqual(400);
        expect(response.body.issue[0].details.text).toEqual(
          'The following parameters are unrecognized by the server: _unrecognizedparam.'
        );
      });
  });

  test('DB is not populated when unrecognized param is in request', async () => {
    const numEntries = await db.collection('bulkExportStatuses').countDocuments({});
    await supertest(app.server)
      .get(`/Group/${GROUP_ID}/$export?_unrecognizedparam=invalid`)
      .expect(400)
      .then(async () => {
        expect(await db.collection('bulkExportStatuses').countDocuments({})).toEqual(numEntries);
      });
  });

  test('throws 400 error when _typeFilter param is supplied with an invalid/unsupported resource type', async () => {
    await supertest(app.server)
      .get(`/Group/${GROUP_ID}/$export?_typeFilter=invalid?status=active`)
      .expect(400)
      .then(response => {
        expect(response.body.resourceType).toEqual('OperationOutcome');
        expect(response.body.issue[0].code).toEqual(400);
        expect(response.body.issue[0].details.text).toEqual(
          'The following resourceTypes are not supported for _typeFilter param for $export: invalid.'
        );
      });
  });

  afterEach(async () => {
    await cleanUpDb();
  });
});

afterAll(async () => {
  await queue.close();
});
