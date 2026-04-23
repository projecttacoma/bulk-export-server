const {
  bulkStatusSetup,
  cleanUpDb,
  createTestResource,
  createTestResourceWithConnect
} = require('../populateTestData');
const { db } = require('../../src/util/mongo');
const build = require('../../src/server/app');
const app = build();
const supertest = require('supertest');
const queue = require('../../src/resources/exportQueue');
const testPatient = require('../fixtures/testPatient.json');
const testEncounter = require('../fixtures/testEncounter.json');
const testCondition = require('../fixtures/testCondition.json');
const testMeasure = require('../fixtures/testMeasure.json');
const testMeasureV2 = require('../fixtures/testMeasureV2.json');
const testMeasure2 = require('../fixtures/testMeasure2.json');
const testValueSet = require('../fixtures/testValueSet.json');
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

  test('throws 400 error when POST request body is not of resourceType "Parameters"', async () => {
    await supertest(app.server)
      .post('/$export')
      .send({
        resourceType: 'Patient',
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
          'Parameters must be specified in a request body of resourceType "Parameters."'
        );
      });
  });

  test('throws 400 error when method is POST and parameters are supplied in the url', async () => {
    await supertest(app.server)
      .post(`/Patient/$export?_type=Encounter`)
      .expect(400)
      .then(response => {
        expect(response.body.resourceType).toEqual('OperationOutcome');
        expect(response.body.issue[0].code).toEqual(400);
        expect(response.body.issue[0].details.text).toEqual(
          'Parameters must be specified in a request body for POST requests.'
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

  test('throws 400 error when patient param is supplied with invalid format', async () => {
    await supertest(app.server)
      .post('/Patient/$export')
      .send({
        resourceType: 'Parameters',
        parameter: [
          {
            name: 'patient',
            valueReference: { reference: 'testPatient' }
          }
        ]
      })
      .then(response => {
        expect(response.body.resourceType).toEqual('OperationOutcome');
        expect(response.body.issue[0].code).toEqual(400);
        expect(response.body.issue[0].details.text).toEqual(
          'All patient references must be of the format "Patient/{id}" for the "patient" parameter.'
        );
      });
  });

  test('throws 404 when patient param is supplied with a patient that is not on the server', async () => {
    await supertest(app.server)
      .post('/Patient/$export')
      .send({
        resourceType: 'Parameters',
        parameter: [
          {
            name: 'patient',
            valueReference: { reference: 'Patient/unknown_patient' }
          }
        ]
      })
      .expect(404)
      .then(response => {
        expect(response.body.resourceType).toEqual('OperationOutcome');
        expect(response.body.issue[0].code).toEqual(404);
        expect(response.body.issue[0].details.text).toEqual(
          'The following patient ids are not available on the server: Patient/unknown_patient'
        );
      });
  });

  test('throws 400 error when POST request body is not of resourceType "Parameters"', async () => {
    await supertest(app.server)
      .post('/Patient/$export')
      .send({
        resourceType: 'Patient',
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
          'Parameters must be specified in a request body of resourceType "Parameters."'
        );
      });
  });

  test('throws 400 error when method is POST and parameters are supplied in the url', async () => {
    await supertest(app.server)
      .post(`/Patient/$export?_type=Encounter`)
      .expect(400)
      .then(response => {
        expect(response.body.resourceType).toEqual('OperationOutcome');
        expect(response.body.issue[0].code).toEqual(400);
        expect(response.body.issue[0].details.text).toEqual(
          'Parameters must be specified in a request body for POST requests.'
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

  test('throws 404 when patient param includes a patient that does not belong to the group', async () => {
    await supertest(app.server)
      .post(`/Group/${GROUP_ID}/$export`)
      .send({
        resourceType: 'Parameters',
        parameter: [
          {
            name: 'patient',
            valueReference: { reference: 'Patient/unknown_patient' }
          }
        ]
      })
      .expect(404)
      .then(response => {
        expect(response.body.resourceType).toEqual('OperationOutcome');
        expect(response.body.issue[0].code).toEqual(404);
        expect(response.body.issue[0].details.text).toEqual(
          `The following patient ids are not members of the group ${GROUP_ID}: Patient/unknown_patient`
        );
      });
  });

  test('throws 400 error when patient param is supplied with invalid format', async () => {
    await supertest(app.server)
      .post(`/Group/${GROUP_ID}/$export`)
      .send({
        resourceType: 'Parameters',
        parameter: [
          {
            name: 'patient',
            valueReference: { reference: 'testPatient' }
          }
        ]
      })
      .then(response => {
        expect(response.body.resourceType).toEqual('OperationOutcome');
        expect(response.body.issue[0].code).toEqual(400);
        expect(response.body.issue[0].details.text).toEqual(
          'All patient references must be of the format "Patient/{id}" for the "patient" parameter.'
        );
      });
  });

  test('throws 400 error when POST request body is not of resourceType "Parameters"', async () => {
    await supertest(app.server)
      .post(`/Group/${GROUP_ID}/$export`)
      .send({
        resourceType: 'Patient',
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
          'Parameters must be specified in a request body of resourceType "Parameters."'
        );
      });
  });

  test('throws 400 error when method is POST and parameters are supplied in the url', async () => {
    await supertest(app.server)
      .post(`/Group/${GROUP_ID}/$export?_type=Encounter`)
      .expect(400)
      .then(response => {
        expect(response.body.resourceType).toEqual('OperationOutcome');
        expect(response.body.issue[0].code).toEqual(400);
        expect(response.body.issue[0].details.text).toEqual(
          'Parameters must be specified in a request body for POST requests.'
        );
      });
  });

  afterEach(async () => {
    await cleanUpDb();
  });
});

describe('Check organizeOutputBy=Patient export logic', () => {
  beforeEach(async () => {
    await bulkStatusSetup();
    await app.ready();
  });

  test('check 202 for system-level organizeOutputBy=Patient', async () => {
    const createJobSpy = jest.spyOn(queue, 'createJob');
    await supertest(app.server)
      .post('/$export')
      .send({
        resourceType: 'Parameters',
        parameter: [
          {
            name: 'organizeOutputBy',
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

  test('check 202 for Patient organizeOutputBy=Patient', async () => {
    const createJobSpy = jest.spyOn(queue, 'createJob');
    await supertest(app.server)
      .post('/Patient/$export')
      .send({
        resourceType: 'Parameters',
        parameter: [
          {
            name: 'organizeOutputBy',
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

  test('check 202 for Group organizeOutputBy=Patient', async () => {
    await createTestResource(testGroup, 'Group');
    const createJobSpy = jest.spyOn(queue, 'createJob');
    await supertest(app.server)
      .post('/Group/testGroup/$export')
      .send({
        resourceType: 'Parameters',
        parameter: [
          {
            name: 'organizeOutputBy',
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

  test('returns 400 for a organizeOutputBy call that specifies a resource type other than Patient', async () => {
    await supertest(app.server)
      .get('/Patient/$export?organizeOutputBy=Other')
      .expect(400)
      .then(response => {
        expect(response.body.resourceType).toEqual('OperationOutcome');
        expect(response.body.issue[0].code).toEqual(400);
        expect(response.body.issue[0].details.text).toEqual(
          'Server does not support the organizeOutputBy parameter for values other than Patient.'
        );
      });
  });

  test('returns 400 for a organizeOutputBy call where _type does not include Patient', async () => {
    await supertest(app.server)
      .get('/Patient/$export?organizeOutputBy=Patient&_type=Condition')
      .expect(400)
      .then(response => {
        expect(response.body.resourceType).toEqual('OperationOutcome');
        expect(response.body.issue[0].code).toEqual(400);
        expect(response.body.issue[0].details.text).toEqual(
          'When _type is specified with organizeOutputBy Patient, the Patient type must be included in the _type parameter.'
        );
      });
  });

  afterEach(async () => {
    await cleanUpDb();
  });
});

describe('Check collect-data logic', () => {
  beforeAll(async () => {
    await createTestResourceWithConnect(testPatient, 'Patient');
    await createTestResource(testEncounter, 'Encounter');
    await createTestResource(testCondition, 'Condition');
    await createTestResource(testMeasure, 'Measure');
    await createTestResource(testMeasureV2, 'Measure');
    await createTestResource(testMeasure2, 'Measure');
    await createTestResource(testValueSet, 'ValueSet');
    await app.ready();
  });

  test('check 200 returned for valid GET request - one measure with url, single code', async () => {
    await supertest(app.server)
      .get(
        '/Measure/$collect-data?periodStart=2025-01-01&periodEnd=2025-12-31&measureUrl=http%3A%2F%2Fexample.com%2FMeasure%2FtestMeasure2&subject=Patient/testPatient'
      )
      .expect(200)
      .then(response => {
        expect(response.body).toBeDefined();
        expect(response.body[0].entry).toHaveLength(2); //expect 1 measure report and encounter
        expect(response.body[0].entry.map(e => e.resource.resourceType)).toEqual(
          expect.arrayContaining(['Encounter', 'MeasureReport'])
        ); // check correct types
        expect(response.body[0].entry).toEqual(
          expect.arrayContaining([expect.objectContaining({ fullUrl: 'urn:uuid:testEncounter' })])
        ); // check specific resources
      });
  });

  test('check 200 returned for valid GET request - one measure with url and version, single code', async () => {
    await supertest(app.server)
      .get(
        '/Measure/$collect-data?periodStart=2025-01-01&periodEnd=2025-12-31&measureUrl=http%3A%2F%2Fexample.com%2FMeasure%2FtestMeasure2%7C1.0.1&subject=Patient/testPatient'
      )
      .expect(200)
      .then(response => {
        expect(response.body).toBeDefined();
        expect(response.body[0].entry).toHaveLength(2); //expect 1 measure report and encounter
        expect(response.body[0].entry.map(e => e.resource.resourceType)).toEqual(
          expect.arrayContaining(['Encounter', 'MeasureReport'])
        ); // check correct types
        expect(response.body[0].entry).toEqual(
          expect.arrayContaining([expect.objectContaining({ fullUrl: 'urn:uuid:testEncounter' })])
        ); // check specific resources
      });
  });

  test('check 200 returned for valid POST request - one measure with url, single code', async () => {
    await supertest(app.server)
      .post('/Measure/$collect-data')
      .send({
        resourceType: 'Parameters',
        parameter: [
          { name: 'periodStart', valueDate: '2025-01-01' },
          { name: 'periodEnd', valueDate: '2025-12-31' },
          {
            name: 'measureUrl',
            valueCanonical: 'http://example.com/Measure/testMeasure2|1.0.1'
          },
          {
            name: 'subject',
            valueString: 'Patient/testPatient'
          }
        ]
      })
      .expect(200)
      .then(response => {
        expect(response.body).toBeDefined();
        expect(response.body[0].entry).toHaveLength(2); //expect 1 measure report and encounter
        expect(response.body[0].entry.map(e => e.resource.resourceType)).toEqual(
          expect.arrayContaining(['Encounter', 'MeasureReport'])
        ); // check correct types
        expect(response.body[0].entry).toEqual(
          expect.arrayContaining([expect.objectContaining({ fullUrl: 'urn:uuid:testEncounter' })])
        ); // check specific resources
      });
  });

  test('check 200 returned for valid POST request - two measures with url', async () => {
    await supertest(app.server)
      .post('/Measure/$collect-data')
      .send({
        resourceType: 'Parameters',
        parameter: [
          { name: 'periodStart', valueDate: '2025-01-01' },
          { name: 'periodEnd', valueDate: '2025-12-31' },
          {
            name: 'measureUrl',
            valueCanonical: 'http://example.com/Measure/testMeasure|1.0.0'
          },
          {
            name: 'measureUrl',
            valueCanonical: 'http://example.com/Measure/testMeasure2'
          },
          {
            name: 'subject',
            valueString: 'Patient/testPatient'
          }
        ]
      })
      .expect(200)
      .then(response => {
        expect(response.body).toBeDefined();
        expect(response.body[0].entry).toHaveLength(4); //expect 2 measure reports, encounter, and condition
        expect(response.body[0].entry.map(e => e.resource.resourceType)).toEqual(
          expect.arrayContaining(['Condition', 'Encounter', 'MeasureReport', 'MeasureReport'])
        ); // check correct types
        expect(response.body[0].entry).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ fullUrl: 'urn:uuid:testEncounter' }),
            expect.objectContaining({ fullUrl: 'urn:uuid:test-condition' })
          ])
        ); // check specific resources
      });
  });

  test('check 400 returned for measure by url without version specified when there are multiple versions', async () => {
    await supertest(app.server)
      .post('/Measure/$collect-data')
      .send({
        resourceType: 'Parameters',
        parameter: [
          { name: 'periodStart', valueDate: '2025-01-01' },
          { name: 'periodEnd', valueDate: '2025-12-31' },
          {
            name: 'measureUrl',
            valueCanonical: 'http://example.com/Measure/testMeasure'
          },
          {
            name: 'subject',
            valueString: 'Patient/testPatient'
          }
        ]
      })
      .expect(400)
      .then(response => {
        expect(response.body).toBeDefined();
        expect(response.body.issue[0].details.text).toBe(
          'Multiple versions of http://example.com/Measure/testMeasure were found.'
        );
      });
  });

  test('check 404 returned for measure by url with version that cannot be found', async () => {
    await supertest(app.server)
      .post('/Measure/$collect-data')
      .send({
        resourceType: 'Parameters',
        parameter: [
          { name: 'periodStart', valueDate: '2025-01-01' },
          { name: 'periodEnd', valueDate: '2025-12-31' },
          {
            name: 'measureUrl',
            valueCanonical: 'http://example.com/Measure/testMeasure2|2.1.0'
          },
          {
            name: 'subject',
            valueString: 'Patient/testPatient'
          }
        ]
      })
      .expect(404)
      .then(response => {
        expect(response.body).toBeDefined();
        expect(response.body.issue[0].details.text).toBe(
          'Measure with url http://example.com/Measure/testMeasure2|2.1.0 not found.'
        );
      });
  });

  test('check 404 returned for measure by url that cannot be found', async () => {
    await supertest(app.server)
      .post('/Measure/$collect-data')
      .send({
        resourceType: 'Parameters',
        parameter: [
          { name: 'periodStart', valueDate: '2025-01-01' },
          { name: 'periodEnd', valueDate: '2025-12-31' },
          {
            name: 'measureUrl',
            valueCanonical: 'http://example.com/Measure/nonExist'
          },
          {
            name: 'subject',
            valueString: 'Patient/testPatient'
          }
        ]
      })
      .expect(404)
      .then(response => {
        expect(response.body).toBeDefined();
        expect(response.body.issue[0].details.text).toBe(
          'Measure with url http://example.com/Measure/nonExist not found.'
        );
      });
  });

  test('check 400 returned for invalid GET request using measureId', async () => {
    await supertest(app.server)
      .get(
        '/Measure/$collect-data?periodStart=2025-01-01&periodEnd=2025-12-31&measureId=testMeasure2&subject=Patient/testPatient'
      )
      .expect(400)
      .then(response => {
        expect(response.body).toBeDefined();
        expect(response.body.issue[0].details.text).toBe(
          'The following parameters are unrecognized by the server: measureId.'
        );
      });
  });

  test('check 400 returned for invalid POST request using measureId', async () => {
    await supertest(app.server)
      .post('/Measure/$collect-data')
      .send({
        resourceType: 'Parameters',
        parameter: [
          { name: 'periodStart', valueDate: '2025-01-01' },
          { name: 'periodEnd', valueDate: '2025-12-31' },
          {
            name: 'measureId',
            valueId: 'testMeasure2'
          },
          {
            name: 'subject',
            valueString: 'Patient/testPatient'
          }
        ]
      })
      .expect(400)
      .then(response => {
        expect(response.body).toBeDefined();
        expect(response.body.issue[0].details.text).toBe(
          'The following parameters are unrecognized by the server: measureId.'
        );
      });
  });

  test('check 400 returned for unrecognized parameter', async () => {
    await supertest(app.server)
      .post('/Measure/$collect-data')
      .send({
        resourceType: 'Parameters',
        parameter: [
          { name: 'periodStart', valueDate: '2025-01-01' },
          { name: 'periodEnd', valueDate: '2025-12-31' },
          {
            name: 'measureId',
            valueId: 'testMeasure2'
          },
          {
            name: 'subject',
            valueString: 'Patient/testPatient'
          },
          {
            name: 'unrecognizedParam',
            valueString: 'invalid'
          }
        ]
      })
      .expect(400)
      .then(response => {
        expect(response.body).toBeDefined();
        expect(response.body.issue[0].details.text).toBe(
          'The following parameters are unrecognized by the server: measureId, unrecognizedParam.'
        );
      });
  });

  test('check 501 returned for unsupported valid parameter', async () => {
    await supertest(app.server)
      .post('/Measure/$collect-data')
      .send({
        resourceType: 'Parameters',
        parameter: [
          { name: 'periodStart', valueDate: '2025-01-01' },
          { name: 'periodEnd', valueDate: '2025-12-31' },
          {
            name: 'measureUrl',
            valueCanonical: 'http://example.com/Measure/testMeasure2'
          },
          {
            name: 'subject',
            valueString: 'Patient/testPatient'
          },
          {
            name: 'validateResources',
            valueBoolean: 'true'
          }
        ]
      })
      .expect(501)
      .then(response => {
        expect(response.body).toBeDefined();
        expect(response.body.issue[0].details.text).toBe(
          'The following parameters are not yet supported by the server: validateResources.'
        );
      });
  });

  afterAll(async () => {
    await cleanUpDb();
  });
});

afterAll(async () => {
  await queue.close();
});
