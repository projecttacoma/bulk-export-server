const build = require('../../src/server/app');
const {
  exportToNDJson,
  patientsQueryForType,
  getDocuments,
  buildSearchParamList
} = require('../../src/util/exportToNDJson');
const QueryBuilder = require('@asymmetrik/fhir-qb');
const { cleanUpDb, createTestResourceWithConnect } = require('../populateTestData');
const testPatient = require('../fixtures/testPatient.json');
const testEncounter = require('../fixtures/testEncounter.json');
const testCondition = require('../fixtures/testCondition.json');

const testServiceRequest = require('../fixtures/testServiceRequest.json');
const app = build();
const fs = require('fs');
const qb = new QueryBuilder({ implementationParameters: { archivedParamPath: '_isArchived' } });
// import queue to close open handles after tests pass
// TODO: investigate why queues are leaving open handles in this file
const queue = require('../../src/resources/exportQueue');
const mockType = ['Patient'];

const expectedFileName = './tmp/123456/Patient.ndjson';
const clientId = '123456';
const mockTypeFilter = 'Patient?type:in=http://example.com/fhir/ValueSet/test';

const complexMockTypeFilter =
  'Patient?type:in=http://example.com/fhir/ValueSet/test,Encounter?type:in=http://example.com/fhir/ValueSet/test2,ServiceRequest?code:in=http://example.com/fhir/ValueSet/test';
const expectedFileNameEncounter = './tmp/123456/Encounter.ndjson';
const expectedFileNameServiceRequest = './tmp/123456/ServiceRequest.ndjson';
const typeFilterWOValueSet = 'Procedure?type:in=http';
const typeFilterWithInvalidType = 'Dog?type:in=http://example.com/fhir/ValueSet/test';
const expectedFileNameInvalidType = './tmp/123456/Dog.ndjson';
const expectedFileNameWOValueSet = './tmp/123456/Procedure.ndjson';
describe('check export logic', () => {
  beforeAll(async () => {
    await createTestResourceWithConnect(testPatient, 'Patient');
    await createTestResourceWithConnect(testEncounter, 'Encounter');
    await createTestResourceWithConnect(testCondition, 'Condition');
    await createTestResourceWithConnect(testServiceRequest, 'ServiceRequest');
    console.log('created test resource');
  });

  beforeEach(async () => {
    await app.ready();
  });

  describe('buildSearchParamList', () => {
    test('returns record of valid search params for valid resource type', () => {
      const results = buildSearchParamList('Encounter');
      expect(results).toBeDefined();
    });
  });

  describe('exportToNDJson', () => {
    test('Expect folder created and export successful when _type parameter is retrieved from request', async () => {
      await exportToNDJson(clientId, mockType);
      expect(fs.existsSync(expectedFileName)).toBe(true);
    });
    test('Expect folder created and export successful when _type parameter is not present in request', async () => {
      await exportToNDJson(clientId);
      expect(fs.existsSync(expectedFileName)).toBe(true);
    });

    test('Expect folder created and export successful when _typeFilter  parameter is retrieved from request', async () => {
      await exportToNDJson(clientId, mockType, mockTypeFilter);
      expect(fs.existsSync(expectedFileName)).toBe(true);
    });
    test('Expect folder created and export successful when _typeFilter  parameter is retrieved from request', async () => {
      await exportToNDJson(clientId, mockType, complexMockTypeFilter);
      expect(fs.existsSync(expectedFileName)).toBe(true);
      expect(fs.existsSync(expectedFileNameEncounter)).toBe(true);
      expect(fs.existsSync(expectedFileNameServiceRequest)).toBe(true);
    });
    test('Expect folder created and export to fail when _typeFilter parameter is retrieved from request and contains an invalid param', async () => {
      await exportToNDJson(clientId, mockType, typeFilterWithInvalidType);
      expect(fs.existsSync(expectedFileNameInvalidType)).toBe(false);
    });
    test('Expect folder created and export to fail when _typeFilter  parameter is retrieved from request but the value set is invalid', async () => {
      await exportToNDJson(clientId, mockType, typeFilterWOValueSet);
      expect(fs.existsSync(expectedFileNameWOValueSet)).toBe(false);
    });
  });

  describe('patientsQueryForType', () => {
    test('Expect patientsQueryForType to succeed for existing resources', async () => {
      const query = await patientsQueryForType(['testPatient'], 'Encounter');
      expect(query).toEqual({ $or: [{ $or: [{ 'subject.reference': 'Patient/testPatient' }] }] });
    });
  });

  describe('getDocuments', () => {
    test('returns Condition document when _typeFilter=Condition?recordedDate=gt2019-01-03T00:00:00Z', async () => {
      const property = {
        recordedDate: 'gt2019-01-03T00:00:00Z'
      };
      const searchParams = buildSearchParamList('Condition');
      const filter = qb.buildSearchQuery({
        req: { method: 'GET', query: property, params: {} },
        parameterDefinitions: searchParams,
        includeArchived: true
      });
      const docObj = await getDocuments('Condition', [filter.query], undefined, ['testPatient']);
      expect(docObj.document.length).toEqual(1);
    });

    test('returns Condition document when _typeFilter=Condition?recordedDate=gt2019-01-03T00:00:00Z&onsetDateTime=gt2019-01-03T00:00:00Z', async () => {
      // test for the "&" operator within the query
      const properties = {
        recordedDate: 'gt2019-01-03T00:00:00Z',
        onsetDateTime: 'gt2019-01-03T00:00:00Z'
      };
      const searchParams = buildSearchParamList('Condition');
      const filter = qb.buildSearchQuery({
        req: { method: 'GET', query: properties, params: {} },
        parameterDefinitions: searchParams,
        includeArchived: true
      });
      const docObj = await getDocuments('Condition', [filter.query], undefined, ['testPatient']);
      expect(docObj.document.length).toEqual(1);
    });

    test('returns no documents when _typeFilter filters out all documents (_typeFilter=Condition?recordedDate=gt2019-01-03T00:00:00Z&onsetDateTime=lt2019-01-03T00:00:00Z', async () => {
      const properties = {
        recordedDate: 'gt2019-01-03T00:00:00Z',
        onsetDateTime: 'lt2019-01-03T00:00:00Z'
      };
      const searchParams = buildSearchParamList('Condition');
      const filter = qb.buildSearchQuery({
        req: { method: 'GET', query: properties, params: {} },
        parameterDefinitions: searchParams,
        includeArchived: true
      });
      const docObj = await getDocuments('Condition', [filter.query], undefined, ['testPatient']);
      expect(docObj.document.length).toEqual(0);
    });

    test('returns Condition document when _typeFilter has "or" condition (_typeFilter=Condition?recordedDate=gt2019-01-03T00:00:00Z,onsetDateTime=lt2019-01-03T00:00:00Z', async () => {
      const recordedDateProperty = {
        recordedDate: 'gt2019-01-03T00:00:00Z'
      };
      const onsetDateTimeProperty = {
        onsetDateTime: 'lt2019-01-03T00:00:00Z'
      };
      const searchParams = buildSearchParamList('Condition');
      const recordedDateFilter = qb.buildSearchQuery({
        req: { method: 'GET', query: recordedDateProperty, params: {} },
        parameterDefinitions: searchParams,
        includeArchived: true
      });
      const onsetDateTimeFilter = qb.buildSearchQuery({
        req: { method: 'GET', query: onsetDateTimeProperty, params: {} },
        parameterDefinitions: searchParams,
        includeArchived: true
      });
      const docObj = await getDocuments('Condition', [recordedDateFilter.query, onsetDateTimeFilter.query], undefined, [
        'testPatient'
      ]);
      expect(docObj.document.length).toEqual(1);
    });

    test('Expect getDocuments to find a resource associated with a patient (Group export)', async () => {
      const docObj = await getDocuments('Encounter', undefined, undefined, ['testPatient']);
      expect(docObj.document.length).toEqual(1);
    });

    test('Expect getDocuments to find the encounter resource with no patient association (Patient export)', async () => {
      const docObj = await getDocuments('Encounter', undefined, undefined, undefined);
      expect(docObj.document.length).toEqual(1);
    });

    test('Expect getDocuments to return empty results for 0 patient association (empty Group)', async () => {
      const docObj = await getDocuments('Encounter', undefined, undefined, []);
      expect(docObj.document.length).toEqual(0);
    });
  });

  afterAll(async () => {
    await cleanUpDb();
  });

  // Close export queue that is created when processing these tests
  // TODO: investigate why queues are leaving open handles in this file
  afterEach(async () => {
    await queue.close();
  });
});
