function getHierarchicalCodes(valueSet) {
  const codes = [];
  if (!valueSet.abstract && !valueSet.inactive && valueSet.code && valueSet.system) {
    codes.push({
      code: contain.code,
      system: contain.system,
      version: contain.version,
      display: contain.display
    });
  }
  if (valueSet.contains && valueSet.contains.length > 0) {
    codes.push(...getHierarchicalCodes(valueSet.contains));
  }

  return codes;
}
function splitTypeFilter(typefilterString) {
  let vsUrl;
  //first strip off the code  up to the ?
  //need to strip off ?in= from the
  vsUrl = typefilterString.replace('?in=', '');
}

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
module.exports = { getCodesFromValueSet, getHierarchicalCodes };
