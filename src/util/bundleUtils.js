const { v4: uuidv4 } = require('uuid');

/**
 * For entries in a transaction bundle whose IDs will be auto-generated, replace all instances of an existing reference
 * to the old id with a reference to the newly generated one.
 *
 * Modify the request type to PUT after forcing the IDs. This will not affect return results, just internal representation
 *
 * @param {Array} entries bundle entries
 * @returns array of entries with replaced references
 */
const replaceReferences = entries => {
  entries.forEach(e => {
    if (e.request.method === 'POST') {
      e.isPost = true;
      e.oldId = e.resource.id;
      e.newId = uuidv4();
    }
  });

  let entriesStr = JSON.stringify(entries);
  const postEntries = entries.filter(e => e.isPost);

  // For each POST entry, replace existing reference across all entries
  postEntries.forEach(e => {
    // Checking fullUrl and id in separate replace loops will prevent invalid ResourceType/ResourceID -> urn:uuid references
    if (e.oldId) {
      const idRegexp = new RegExp(`${e.resource.resourceType}/${e.oldId}`, 'g');
      entriesStr = entriesStr.replace(idRegexp, `${e.resource.resourceType}/${e.newId}`);
    }
    if (e.fullUrl) {
      const urnRegexp = new RegExp(e.fullUrl, 'g');
      entriesStr = entriesStr.replace(urnRegexp, `${e.resource.resourceType}/${e.newId}`);
    }
  });

  // Remove metadata and modify request type/resource id
  const newEntries = JSON.parse(entriesStr).map(e => {
    if (e.isPost) {
      e.resource.id = e.newId;
      e.request = {
        method: 'PUT',
        url: `${e.resource.resourceType}/${e.newId}`
      };
    }

    return { resource: e.resource, request: e.request };
  });

  return newEntries;
};

module.exports = { replaceReferences };
