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
const testValueSet = require('../fixtures/valuesets/example-vs-1.json');

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
const mockTypeFilter = 'Patient?maritalStatus:in=http://example.com/example-valueset-1';

const complexMockTypeFilter =
  'Patient?maritalStatus:in=http://example.com/example-valueset-1,Encounter?type:in=http://example.com/example-valueset-1,ServiceRequest?code:in=http://example.com/example-valueset-1';
const mockOrTypeFilter = [
  'Patient?maritalStatus:in=http://example.com/example-valueset-1',
  'Encounter?type:in=http://example.com/example-valueset-1'
];
const expectedFileNameEncounter = './tmp/123456/Encounter.ndjson';
const expectedFileNameServiceRequest = './tmp/123456/ServiceRequest.ndjson';
const typeFilterWOValueSet = 'Procedure?type:in=http';
const typeFilterWithInvalidType = 'Dog?type:in=http://example.com/example-valueset-1';
const expectedFileNameInvalidType = './tmp/123456/Dog.ndjson';
const expectedFileNameWOValueSet = './tmp/123456/Procedure.ndjson';

const axios = require('axios');
jest.mock('axios');

describe('check export logic', () => {
  beforeAll(async () => {
    await createTestResourceWithConnect(testPatient, 'Patient');
    await createTestResourceWithConnect(testEncounter, 'Encounter');
    await createTestResourceWithConnect(testCondition, 'Condition');
    await createTestResourceWithConnect(testServiceRequest, 'ServiceRequest');
    await createTestResourceWithConnect(testValueSet, 'ValueSet');
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

    test('returns empty record of valid search params for invalid resource type', () => {
      const results = buildSearchParamList('BiologicallyDerivedProduct');
      expect(results).toBeDefined();
    });
  });

  describe('exportToNDJson', () => {
    beforeEach(async () => {
      fs.rmSync('./tmp/123456', { recursive: true, force: true });
    });
    test('Expect folder created and export successful when _type parameter is retrieved from request', async () => {
      await exportToNDJson({ clientEntry: clientId, types: mockType });
      expect(fs.existsSync(expectedFileName)).toBe(true);
    });
    test('Expect folder created and export successful when _type parameter is not present in request', async () => {
      await exportToNDJson({ clientEntry: clientId });
      expect(fs.existsSync(expectedFileName)).toBe(true);
    });

    test('Expect folder created, export successful, and submission endpoint called when bulkSubmitEndpoint is present', async () => {
      axios.post.mockResolvedValue({ status: 200 });
      await exportToNDJson({ clientEntry: clientId, bulkSubmitEndpoint: 'testEndpoint' });
      expect(axios.post).toHaveBeenCalledWith(
        'testEndpoint',
        {
          resourceType: 'Parameters',
          parameter: [
            { name: 'manifestUrl', valueString: 'http://localhost:3000/bulkstatus/123456' },
            {
              name: 'submissionStatus',
              valueCoding: {
                system: 'http://hl7.org/fhir/uv/bulkdata/ValueSet/submission-status',
                code: 'complete'
              }
            },
            { name: 'submitter', valueIdentifier: { value: 'bulkExportSubmitter' } },
            { name: 'submissionId', valueString: '123456' },
            { name: 'fhirBaseUrl', valueString: 'http://localhost:3000' }
          ]
        },
        { headers: { accept: 'application/fhir+json', 'content-type': 'application/fhir+json' } }
      );
      expect(fs.existsSync(expectedFileName)).toBe(true);
    });

    test('Expect folder created and export successful when _typeFilter parameter is retrieved from request', async () => {
      await exportToNDJson({ clientEntry: clientId, type: mockType, typeFilter: mockTypeFilter });
      expect(fs.existsSync(expectedFileName)).toBe(true);
    });
    test('Expect folder created and export successful when complex _typeFilter parameter is retrieved from request', async () => {
      await exportToNDJson({ clientEntry: clientId, type: mockType, typeFilter: complexMockTypeFilter });
      expect(fs.existsSync(expectedFileName)).toBe(true);
      expect(fs.existsSync(expectedFileNameEncounter)).toBe(true);
      expect(fs.existsSync(expectedFileNameServiceRequest)).toBe(true);
    });
    test('Expect folder created and export successful when Array _typeFilter parameter is retrieved from request', async () => {
      await exportToNDJson({ clientEntry: clientId, type: mockType, typeFilter: mockOrTypeFilter });
      expect(fs.existsSync(expectedFileName)).toBe(true);
      expect(fs.existsSync(expectedFileNameEncounter)).toBe(true);
    });
    test('Expect folder created and export to fail when _typeFilter parameter is retrieved from request and contains an invalid param', async () => {
      // Note: invalid types are checked in the export service
      await exportToNDJson({ clientEntry: clientId, type: mockType, typeFilter: typeFilterWithInvalidType });
      expect(fs.existsSync('./tmp/123456')).toBe(true);
      expect(fs.existsSync(expectedFileNameInvalidType)).toBe(false);
    });
    test('Expect export to fail when _typeFilter parameter is retrieved from request but the value set is invalid', async () => {
      await exportToNDJson({ clientEntry: clientId, type: mockType, typeFilter: typeFilterWOValueSet });
      expect(fs.existsSync(expectedFileNameWOValueSet)).toBe(false);
    });
    test('Expect folder created and export successful when organizeOutputBy=Patient parameter is retrieved from request', async () => {
      await exportToNDJson({ clientEntry: clientId, types: mockType, typeFilter: mockTypeFilter, byPatient: true });
      expect(fs.existsSync('./tmp/123456/testPatient.ndjson')).toBe(true);
    });
  });

  describe('patientsQueryForType', () => {
    test('Expect patientsQueryForType to succeed for existing resources', async () => {
      const query = await patientsQueryForType(['testPatient'], 'Encounter');
      expect(query).toEqual({ $or: [{ $or: [{ 'subject.reference': 'Patient/testPatient' }] }] });
    });
  });

  describe('getDocuments', () => {
    describe('_typeFilter tests', () => {
      test('returns Condition document when _typeFilter=Condition?recorded-date=gt2019-01-03T00:00:00Z', async () => {
        const property = {
          'recorded-date': 'gt2019-01-03T00:00:00Z'
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

      test('returns Condition document when _typeFilter=Condition?recorded-date=gt2019-01-03T00:00:00Z&onset-date=gt2019-01-03T00:00:00Z', async () => {
        // test for the "&" operator within the query
        const properties = {
          'recorded-date': 'gt2019-01-03T00:00:00Z',
          'onset-date': 'gt2019-01-03T00:00:00Z'
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

      test('returns no documents when _typeFilter filters out all documents (_typeFilter=Condition?recorded-date=gt2019-01-03T00:00:00Z&onset-date=lt2019-01-03T00:00:00Z', async () => {
        const properties = {
          'recorded-date': 'gt2019-01-03T00:00:00Z',
          'onset-date': 'lt2019-01-03T00:00:00Z'
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

      test('returns Condition document when _typeFilter has "or" condition (_typeFilter=Condition?recorded-date=gt2019-01-03T00:00:00Z,onset-date=lt2019-01-03T00:00:00Z', async () => {
        const recordedDateProperty = {
          'recorded-date': 'gt2019-01-03T00:00:00Z'
        };
        const onsetDateTimeProperty = {
          'onset-date': 'lt2019-01-03T00:00:00Z'
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
        const docObj = await getDocuments(
          'Condition',
          [recordedDateFilter.query, onsetDateTimeFilter.query],
          undefined,
          ['testPatient']
        );
        expect(docObj.document.length).toEqual(1);
      });
    });

    describe('Patient-based filtering tests', () => {
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

    describe('_elements tests', () => {
      test('returns Condition document with only the id, resourceType and subject (mandatory elements for Condition), and the SUBSETTED tag when _elements=Condition.id', async () => {
        const docObj = await getDocuments('Condition', undefined, undefined, undefined, ['id']);
        expect(docObj.document.length).toEqual(1);
        expect(docObj.document[0]).toEqual({
          resourceType: 'Condition',
          id: 'test-condition',
          subject: {
            reference: 'Patient/testPatient'
          },
          meta: {
            tag: [
              {
                code: 'SUBSETTED',
                system: 'http://terminology.hl7.org/CodeSystem/v3-ObservationValue'
              }
            ]
          }
        });
      });
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
