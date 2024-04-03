const fs = require('fs');
const path = require('path');

const STRUCTURE_DEFINITIONS_BASE_PATH = path.join(__dirname, '../resource-definitions');
const mandatoryElemsOutputPath = path.resolve(
  path.join(__dirname, '../compartment-definition/mandatory-elements.json')
);

/**
 * Parse the StructureDefinition of resource types supported by this server for mandatory elements
 * @returns {Object} object whose keys are resourceTypes and values are arrays of strings that are mandatory elements
 */
async function main() {
  const files = fs.readdirSync(STRUCTURE_DEFINITIONS_BASE_PATH).map(f => ({
    shortName: f.split('.profile')[0],
    fullPath: path.join(STRUCTURE_DEFINITIONS_BASE_PATH, f)
  }));

  const mandatoryElementsResults = {};

  files.forEach(f => {
    let mandatoryElements = [];

    // read the contents of the file
    const structureDef = JSON.parse(fs.readFileSync(f.fullPath, 'utf8'));
    // QUESTION: should I be using snapshot or differential ?
    structureDef.snapshot.element.forEach(e => {
      const elem = e.id.split('.');
      if (elem.length === 2) {
        if (e.min === 1) {
          mandatoryElements.push(elem[1]);
        }
      }
    });
    mandatoryElementsResults[structureDef.id] = mandatoryElements;
  });

  return mandatoryElementsResults;
}

main()
  .then(mandatoryElementsResults => {
    fs.writeFileSync(mandatoryElemsOutputPath, JSON.stringify(mandatoryElementsResults, null, 2), 'utf8');
    console.log(`Wrote file to ${mandatoryElemsOutputPath}`);
  })
  .catch(e => {
    console.error(e);
  });
