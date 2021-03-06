const fs = require('fs');
const path = require('path');
const mongoUtil = require('../util/mongo');
const { createResource, findResourcesWithQuery } = require('../util/mongo.controller');

const connectathonPath = path.resolve(path.join(__dirname, '../../connectathon/fhir401/bundles/measure/'));
// bundles that are not the latest available version or contain reference errors
const IGNORED_BUNDLES = ['EXM347-3.2.000-bundle.json', 'EXM347-4.3.000-bundle.json'];
// files containing EXM bundles of interest from connectathon repo
const bundleFiles = [];

/**
 * Retrieves EXM bundle files from the connectathon repo using a regular expression.
 * Uses recursion to parse through all available subdirectories.
 * @param {string} directory - directory path to start at
 * @returns array of string paths that represent the bundle files of interest
 */
const getBundleFiles = directory => {
  const fileNameRegExp = new RegExp(/(^EXM.*.json$)/);
  const filesInDirectory = fs.readdirSync(directory);
  filesInDirectory.forEach(file => {
    const absolute = path.join(directory, file);
    if (fs.statSync(absolute).isDirectory()) {
      getBundleFiles(absolute);
    } else if (fileNameRegExp.test(file) && !IGNORED_BUNDLES.includes(file)) {
      bundleFiles.push(absolute);
    }
  });
};

/**
 * Uploads all the resources from the connectathon measure bundles into the
 * database.
 *
 * TODO: Currently configured for fhir401 connectathon measure bundles,
 * but may want to expand to other measure bundle providers in the future.
 */
async function main() {
  await mongoUtil.client.connect();
  console.log('Connected successfully to server');

  try {
    getBundleFiles(connectathonPath);
  } catch (e) {
    throw new Error(
      'Connectathon directory not found. Git clone the connectathon repo into the root directory and run script again'
    );
  }

  const measureIds = [];

  const bundlePromises = bundleFiles.map(async filePath => {
    // read each EXM bundle file
    const data = fs.readFileSync(filePath, 'utf8');
    if (data) {
      const bundle = JSON.parse(data);
      // retrieve each resource and insert into database
      const uploads = bundle.entry.map(async res => {
        try {
          if (res.resource.resourceType === 'Measure') {
            measureIds.push(res.resource.id);
          } else if (res.resource.resourceType != 'Library' && res.resource.resourceType != 'MeasureReport') {
            await createResource(res.resource, res.resource.resourceType);
          }
        } catch (e) {
          // ignore duplicate key errors for Libraries, ValueSets
          if (e.code !== 11000 || res.resource.resourceType === 'Measure') {
            console.log(e.message);
          }
        }
      });
      await Promise.all(uploads);
    }
  });
  await Promise.all(bundlePromises);

  // Create a group resource for all EXM* patients
  const exmRegex = /EXM\d+/;
  const exmIds = measureIds.filter(mid => exmRegex.test(mid)).map(mid => exmRegex.exec(mid)[0]);

  const allPatientIds = (await findResourcesWithQuery({}, 'Patient', { projection: { _id: 0, id: 1 } })).map(p => p.id);
  await Promise.all(exmIds.map(async exmId => createPatientGroupsPerMeasure(exmId, allPatientIds)));

  return 'Bundles and groups uploaded';
}

async function createPatientGroupsPerMeasure(exmId, allPatientIds) {
  const patientIdRegex = new RegExp(exmId, 'i');

  const exmPatientIds = allPatientIds.filter(id => patientIdRegex.test(id));

  const group = {
    resourceType: 'Group',
    id: `${exmId}-patients`,
    type: 'person',
    actual: true,
    member: exmPatientIds.map(pid => ({
      entity: {
        reference: `Patient/${pid}`
      }
    }))
  };

  try {
    await createResource(group, 'Group');
  } catch (e) {
    if (e.code !== 11000) {
      console.log(e.message);
    }
  }
}

main()
  .then(console.log)
  .catch(console.error)
  .finally(async () => await mongoUtil.client.close());
