const { getHierarchicalCodes, getCodesFromValueSet } = require('../../src/util/valueSetHelper');

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
});
