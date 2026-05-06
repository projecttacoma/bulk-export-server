jest.mock('../../src/services/phenoml.service', () => ({
  postCohort: jest.fn()
}));
jest.mock('../../src/resources/exportQueue', () => ({
  createJob: jest.fn(),
  on: jest.fn()
}));
jest.mock('../../src/util/mongo.controller', () => ({
  addPendingBulkExportRequest: jest.fn()
}));
jest.mock('../../src/util/exportToNDJson', () => ({
  addTypeFilter: jest.fn(),
  getDocuments: jest.fn()
}));

const build = require('../../src/server/app');
const app = build();
const queue = require('../../src/resources/exportQueue');
const { postCohort } = require('../../src/services/phenoml.service');
const { addPendingBulkExportRequest } = require('../../src/util/mongo.controller');
const { getDocuments } = require('../../src/util/exportToNDJson');

describe('Check PhenoML natural-language cohort export logic', () => {
  beforeAll(async () => {
    await app.ready();
  });

  beforeEach(() => {
    addPendingBulkExportRequest.mockResolvedValue('test-client-id');
    getDocuments.mockResolvedValue({
      document: [
        {
          resourceType: 'Condition',
          id: 'test-condition',
          subject: {
            reference: 'Patient/testPatient'
          }
        }
      ]
    });
  });

  test('checks 202 returned and export job is populated from PhenoML cohort queries', async () => {
    postCohort.mockResolvedValue({
      success: true,
      queries: [
        {
          resource_type: 'Condition',
          search_params: 'recorded-date=gt2019-01-02T00:00:00Z',
          concept: 'condition after January 2, 2019'
        }
      ]
    });
    queue.createJob.mockReturnValue({
      save: jest.fn().mockResolvedValue()
    });

    const response = await app.inject({
      method: 'POST',
      url: '/Group/$export-from-description',
      payload: {
        resourceType: 'Parameters',
        parameter: [
          {
            name: 'text',
            valueString: 'patients with a condition after January 2, 2019'
          },
          {
            name: '_type',
            valueString: 'Patient,Condition'
          }
        ]
      }
    });

    expect(response.statusCode).toEqual(202);
    expect(response.headers['content-location']).toBeDefined();

    expect(postCohort).toHaveBeenCalledWith('patients with a condition after January 2, 2019');
    expect(queue.createJob).toHaveBeenCalled();
    expect(queue.createJob.mock.calls[0][0]).toEqual(
      expect.objectContaining({
        patientIds: ['testPatient'],
        systemLevelExport: false,
        types: ['Patient', 'Condition'],
        typeFilter: ['Condition?recorded-date=gt2019-01-02T00:00:00Z'],
        cohort: expect.objectContaining({
          description: 'patients with a condition after January 2, 2019',
          patientCount: 1
        })
      })
    );
  });

  test('checks 400 returned when text parameter is missing', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/Group/$export-from-description',
      payload: {
        resourceType: 'Parameters',
        parameter: [
          {
            name: '_type',
            valueString: 'Patient'
          }
        ]
      }
    });

    expect(response.statusCode).toEqual(400);
    expect(response.json().resourceType).toEqual('OperationOutcome');
    expect(response.json().issue[0].details.text).toEqual(
      'A cohort description is required using the "text" parameter.'
    );

    expect(postCohort).not.toHaveBeenCalled();
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    jest.clearAllMocks();
  });
});
