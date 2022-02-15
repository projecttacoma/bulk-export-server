const valueSetsForCodeService = require('./valueSetHelper');

function createDrAndGetVs(request) {
  const dataRequirements = request.body.dataRequirements;
  let queries;

  dataRequirements._typeFilter.map(dr => {
    if (dr.codeFilter) {
      const q = { path: dr.path, type: dr.type, valueSet: dr.codeFilter.url };
      queries.push(q);
    }
    const valueSets = valueSetsForCodeService(queries.valueSet);
    if (dr.codeFilter && dr.codeFilter.length > 0) {
      const vs = dr.codeFilter
        .filter(cf => cf.valueSet)
        .map(cf => {
          return cf.valueSet;
        });
      return vs;
    }
  });
  return dataRequirements;
}
module.exports = { createDrAndGetVs };
