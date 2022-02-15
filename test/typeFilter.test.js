const { valueSetsForCodeService } = require('../src/util/valueSetHelper');

const exampleValueSet1 = require('../fixtures/valuesets/example-vs-1.json');
const exampleValueSet2 = require('../fixtures/valuesets/example-vs-2.json');
const exampleExpandedValueset = require('../fixtures/valuesets/example-expanded-vs.json');
describe('valueSetsForCodeService', () => {
  test('should include all codes', () => {
    const map = valueSetsForCodeService([exampleValueSet1, exampleValueSet2]);

    // map should key both URLs
    const vsetUrls = Object.keys(map);
    expect(vsetUrls).toHaveLength(2);
    expect(vsetUrls).toEqual(expect.arrayContaining([exampleValueSet1.url, exampleValueSet2.url]));

    const vs1Entry = map[exampleValueSet1.url];
    const vs1Codes = vs1Entry[exampleValueSet1.version];
    const vs2Entry = map[exampleValueSet2.url];
    const vs2Codes = vs2Entry[exampleValueSet2.version];

    // This entry of the map should contain all codes defined in compose.include
    expect(vs1Codes).toBeDefined();
    expect(vs2Codes).toBeDefined();

    // Check all codes listed
    exampleValueSet1.compose.include.forEach(i => {
      expect(vs1Codes).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            system: i.system,
            version: i.version
          })
        ])
      );

      i.concept?.forEach(c => {
        expect(vs1Codes).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              code: c.code,
              display: c.display
            })
          ])
        );
      });
    });
  });

  test('should accurately convert valuesets with expansions of hierarchical and inactive codes', () => {
    const vsMap = valueSetsForCodeService([exampleExpandedValueset]);

    const vs1Entry = vsMap[exampleExpandedValueset.url];
    // Version is `N/A`, so the converter turns that into ''
    const vs1Codes = vs1Entry[''];

    expect(vs1Codes).toBeDefined();
    // Check that the codes array contains the codes that are active and not abstract
    expect(vs1Codes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'EXPEC',
          system: 'http://terminology.hl7.org/CodeSystem/v3-ActMood'
        }),
        expect.objectContaining({
          code: 'GOL',
          system: 'http://terminology.hl7.org/CodeSystem/v3-ActMood'
        }),
        expect.objectContaining({
          code: 'RSK',
          system: 'http://terminology.hl7.org/CodeSystem/v3-ActMood'
        }),
        expect.objectContaining({
          code: 'OPT',
          system: 'http://terminology.hl7.org/CodeSystem/v3-ActMood'
        }),
        expect.objectContaining({
          code: 'NOT-ABS',
          system: 'http://terminology.hl7.org/CodeSystem/v3-ActMood'
        })
      ])
    );

    // Check that the inactive and abstract codes are ignored
    expect(vs1Codes).toEqual(
      expect.not.arrayContaining([
        expect.objectContaining({
          code: 'CRT',
          system: 'http://terminology.hl7.org/CodeSystem/v3-ActMood'
        }),
        expect.objectContaining({
          code: 'ABS',
          system: 'http://terminology.hl7.org/CodeSystem/v3-ActMood'
        })
      ])
    );
  });
});
