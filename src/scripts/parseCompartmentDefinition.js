const fs = require('fs');
const path = require('path');

const compartmentDefPath = path.resolve(
  path.join(__dirname, '../compartment-definition/compartmentdefinition-patient.json')
);
const outputPath = path.resolve(path.join(__dirname, '../compartment-definition/patientExportResourceTypes.json'));
const jsonStr = fs.readFileSync(compartmentDefPath, 'utf8');

/**
 * Parse Patient compartment definition for all resource types
 * @param {string} compartmentJson the string content of the patient compartment definition json file
 * @return {Array} array of resource types that appear in the compartment definition resource array
 */
function parse(compartmentJson) {
  const compartmentDefinition = JSON.parse(compartmentJson);
  const resourceTypes = [];
  compartmentDefinition.resource.forEach(resourceObj => {
    if (resourceObj.param && resourceObj.param.length > 0) resourceTypes.push(resourceObj.code);
  });
  return resourceTypes;
}

try {
  const data = parse(jsonStr);
  fs.writeFileSync(outputPath, JSON.stringify(data, null, 2), 'utf8');
  console.log(`Wrote file to ${outputPath}`);
} catch (e) {
  console.error(e);
}
