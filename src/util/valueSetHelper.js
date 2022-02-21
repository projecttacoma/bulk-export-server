

function getHierarchicalCodes(contains) {
  const codes = [];
  contains.forEach(contain => {
    if (!contain.abstract && !contain.inactive && contain.code && contain.system) {
      codes.push({
        code: contain.code,
        system: contain.system,
        version: contain.version,
        display: contain.display
      });
    }
    if (contain.contains && contain.contains.length > 0) {
      codes.push(...getHierarchicalCodes(contain.contains));
    }
  });
  return codes;
}
module.exports = { valueSetsForCodeService, getHierarchicalCodes };
