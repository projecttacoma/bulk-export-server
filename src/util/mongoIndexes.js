const { patientAttributePaths } = require('fhir-spec-tools/build/data/patient-attribute-paths');
const supportedResources = require('./supportedResources');

function indexNameForKey(key) {
  return Object.entries(key)
    .map(([field, direction]) => `${field.replace(/[^a-zA-Z0-9]+/g, '_')}_${direction}`)
    .join('_');
}

function uniqueIndexSpecs(specs) {
  const seen = new Set();
  return specs.filter(spec => {
    const signature = JSON.stringify(spec.key);
    if (seen.has(signature)) {
      return false;
    }
    seen.add(signature);
    return true;
  });
}

function collectDataIndexSpecsForResource(resourceType, measureCodeFilterPaths = {}, options = {}) {
  const { allowNonUniqueIdFallback = false } = options;
  const specs = [
    {
      key: { id: 1 },
      options: { name: 'id_1', unique: true },
      fallbackOptions: allowNonUniqueIdFallback ? { name: 'id_1' } : null
    }
  ];

  if (resourceType === 'Measure') {
    specs.push({
      key: { url: 1, version: 1 },
      options: { name: 'url_1_version_1' }
    });
  }

  if (resourceType === 'ValueSet') {
    specs.push({
      key: { url: 1 },
      options: { name: 'url_1' }
    });
  }

  patientAttributePaths[resourceType]?.forEach(patientReferencePath => {
    const key = { [`${patientReferencePath}.reference`]: 1 };
    specs.push({
      key,
      options: { name: indexNameForKey(key) }
    });
  });

  measureCodeFilterPaths[resourceType]?.forEach(codeFilterPath => {
    const key = { [`${codeFilterPath}.coding.code`]: 1 };
    specs.push({
      key,
      options: { name: indexNameForKey(key) }
    });
  });

  return uniqueIndexSpecs(specs);
}

async function collectMeasureCodeFilterPaths(db) {
  const codeFilterPaths = {};
  const measures = await db
    .collection('Measure')
    .find({}, { projection: { _id: 0, contained: 1 } })
    .toArray();

  measures.forEach(measure => {
    const dataRequirements = measure.contained?.find(c => c.id === 'effective-data-requirements')?.dataRequirement;
    dataRequirements?.forEach(dataRequirement => {
      dataRequirement.codeFilter?.forEach(codeFilter => {
        if (!dataRequirement.type || !codeFilter.path) {
          return;
        }

        const hasValueSet = !!codeFilter.valueSet;
        const hasCodes = codeFilter.code?.some(coding => !!coding.code);
        if (!hasValueSet && !hasCodes) {
          return;
        }

        if (!codeFilterPaths[dataRequirement.type]) {
          codeFilterPaths[dataRequirement.type] = new Set();
        }
        codeFilterPaths[dataRequirement.type].add(codeFilter.path);
      });
    });
  });

  return Object.fromEntries(Object.entries(codeFilterPaths).map(([type, paths]) => [type, [...paths]]));
}

async function ensureIndexesForResource(collection, resourceType, measureCodeFilterPaths = {}, options = {}) {
  const results = [];
  const specs = collectDataIndexSpecsForResource(resourceType, measureCodeFilterPaths, options);

  for (const spec of specs) {
    try {
      const name = await collection.createIndex(spec.key, {
        background: true,
        ...spec.options
      });
      results.push({ resourceType, name, key: spec.key });
    } catch (error) {
      if (spec.fallbackOptions) {
        try {
          const name = await collection.createIndex(spec.key, {
            background: true,
            ...spec.fallbackOptions
          });
          results.push({ resourceType, name, key: spec.key, fallback: true });
          continue;
        } catch (fallbackError) {
          results.push({ resourceType, name: spec.options.name, key: spec.key, error: fallbackError });
          continue;
        }
      }

      results.push({ resourceType, name: spec.options.name, key: spec.key, error });
    }
  }

  return results;
}

async function ensureCollectDataIndexes(db, options = {}) {
  const { existingCollectionsOnly = true, resourceTypes = supportedResources } = options;
  const measureCodeFilterPaths = await collectMeasureCodeFilterPaths(db);
  const existingCollections = existingCollectionsOnly
    ? new Set((await db.listCollections().toArray()).map(collection => collection.name))
    : null;
  const targetResourceTypes = existingCollections
    ? resourceTypes.filter(resourceType => existingCollections.has(resourceType))
    : resourceTypes;

  const results = [];
  for (const resourceType of targetResourceTypes) {
    const collection = db.collection(resourceType);
    results.push(...(await ensureIndexesForResource(collection, resourceType, measureCodeFilterPaths, options)));
  }

  return results;
}

module.exports = {
  collectDataIndexSpecsForResource,
  collectMeasureCodeFilterPaths,
  ensureCollectDataIndexes,
  ensureIndexesForResource,
  indexNameForKey
};
