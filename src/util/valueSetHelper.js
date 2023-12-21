/**
 *
 * @param valueSetResources FHIR ValueSets.
 * @returns an array of the codes in the valueSet
 */
function getHierarchicalCodes(valueSetResources) {
  const codes = [];
  valueSetResources.forEach(valueSet => {
    if (!valueSet.abstract && !valueSet.inactive && valueSet.code && valueSet.system) {
      codes.push({
        code: valueSet.code,
        system: valueSet.system,
        version: valueSet.version,
        display: valueSet.display
      });
    }
    if (valueSet.contains && valueSet.contains.length > 0) {
      codes.push(...getHierarchicalCodes(valueSet.contains));
    }
  });
  return codes;
}
/**
 *
 *
 * NOTE: This uses the `compose` attribute of the ValueSet to get code. This is incorrect and
 * should be using the `expansion`. But current example measures have ValueSets with compose
 * only.
 *
 * @param valueSetResources FHIR ValueSets.
 * @returns The value set DB structure needed to perform the mongo query to find this valueset.
 */
function getCodesFromValueSet(valueSet) {
  let codes = [];
  if (valueSet.expansion && valueSet.expansion.contains && valueSet.expansion.contains.length > 0) {
    // Default to using expansion if it exists
    codes = getHierarchicalCodes(valueSet.expansion.contains);
  } else if (valueSet.compose) {
    // Only use compose if expansion doesn't exist
    // Iterate over include components and add all concepts
    valueSet.compose.include.forEach(include => {
      include.concept?.forEach(concept => {
        if (concept.code && include.system) {
          codes.push({
            code: concept.code,
            system: include.system,
            version: include.version,
            display: concept.display
          });
        }
      });
    });
  }
  return codes;
}
module.exports = { getHierarchicalCodes, getCodesFromValueSet };
