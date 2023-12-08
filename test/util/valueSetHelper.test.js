const { getHierarchicalCodes, getCodesFromValueSet } = require('../../src/util/valueSetHelper');
// import queue to close open handles after tests pass
// TODO: investigate why queues are leaving open handles in this file
const queue = require('../../src/resources/exportQueue');
describe('getHierarchicalCodes', () => {
  test('Returns array of codes in ValueSet', () => {
    const valueSetArray = [
      {
        code: 'testCode',
        system: 'testSystem',
        version: 'testVersion',
        display: 'testDisplay',
        expansion: {}
      }
    ];

    const expected_codes = [
      {
        code: 'testCode',
        system: 'testSystem',
        version: 'testVersion',
        display: 'testDisplay'
      }
    ];
    const results = getHierarchicalCodes(valueSetArray);
    expect(results).toEqual(expected_codes);
  });
});

describe('getCodesFromValueSet', () => {
  const expected_codes = [
    {
      code: 'testCode',
      system: 'testSystem',
      version: 'testVersion',
      display: 'testDisplay'
    }
  ];
  test('gets hierarchical codes when expansion is defined', () => {
    const valueSet = {
      resourceType: 'ValueSet',
      expansion: {
        contains: [
          {
            code: 'testCode',
            system: 'testSystem',
            version: 'testVersion',
            display: 'testDisplay'
          }
        ]
      }
    };
    const results = getCodesFromValueSet(valueSet);
    expect(results).toEqual(expected_codes);
  });

  test('gets codes from compose if expansion does not exist', () => {
    const valueSet = {
      resourceType: 'ValueSet',
      compose: {
        include: [
          {
            system: 'testSystem',
            version: 'testVersion',
            concept: [
              {
                code: 'testCode',
                display: 'testDisplay'
              }
            ]
          }
        ]
      }
    };
    const results = getCodesFromValueSet(valueSet);
    expect(results).toEqual(expected_codes);
  });

  // Close export queue that is created when processing these tests
  // TODO: investigate why queues are leaving open handles in this file
  afterEach(async () => {
    await queue.close();
  });
});
