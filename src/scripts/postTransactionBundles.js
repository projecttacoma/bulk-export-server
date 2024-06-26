const axios = require('axios');
const path = require('path');
const fs = require('fs');
const { createPatientGroupsPerMeasure } = require('../util/groupUtils');
const mongoUtil = require('../util/mongo');

// for each group, include the patients that are members of the previous group
// (ex. creates a group of size 10, a group of size 100, ..., a group of size 10,000)
const GROUP_SIZES = [10, 90, 900, 9000];

/**
 * Uploads all transaction bundles from the specified directory
 * into the database. Creates a group resource containing
 * all the patients (with their updated ids that are created
 * during the transaction bundle upload process) in the process.
 * Uploads the created group resource to the database.
 *
 * Note: Synthea creates batch bundles for hospital/practitioner info, which
 * should be POSTed before POSTing the transaction bundles that refer to patients.
 */
async function main() {
  await mongoUtil.client.connect();
  console.log('Connected successfully to server');

  const bundleDir = path.resolve(process.argv[2]);
  const measureId = process.argv[3];
  if (!measureId) {
    throw new Error('Must supply a measure id to use for specifying the id of the created Group resource');
  }

  const patientRegEx = new RegExp('Patient/[^/]*');
  // store uploaded patientIds to be added as members to FHIR Group (across all patients uploaded so far)
  const allPatientIds = [];

  for (const groupSize of GROUP_SIZES) {
    const directoryPath = path.join(bundleDir, `${measureId}-${groupSize}-patients`, 'fhir');
    const directoryFiles = fs.readdirSync(directoryPath);

    // upload practitioner/hospital batch bundles first, if present
    directoryFiles
      .filter(file => file.startsWith('practitioner') || file.startsWith('hospital'))
      .forEach(async file => {
        await axios.post(
          `${process.env.BULK_BASE_URL}/`,
          JSON.parse(fs.readFileSync(path.join(directoryPath, file), 'utf8')),
          { headers: { 'Content-Type': 'application/json+fhir' } }
        );
      });

    const patientFiles = directoryFiles.filter(
      // filter out practitioner/hospital batch bundles and group resource, if present
      // (the group resource will have outdated patient references)
      file => !file.startsWith('practitioner') && !file.startsWith('hospital') && !file.startsWith('group')
    );
    const promises = [];
    for (const file of patientFiles) {
      const fileContents = JSON.parse(fs.readFileSync(path.join(directoryPath, file), 'utf8'));
      const results = axios.post(`${process.env.BULK_BASE_URL}/`, fileContents, {
        headers: { 'Content-Type': 'application/json+fhir' }
      });
      promises.push(results);
    }
    const allResults = await Promise.all(promises);
    const allData = allResults.map(result => result.data);
    const patientIds = allData.map(data => {
      const location = data.entry.find(e => e.response.location.startsWith('/Patient'));
      if (patientRegEx.test(location?.response.location)) {
        return location.response.location.replace('/Patient/', '');
      }
    });
    allPatientIds.push(...patientIds);
    const success = await createPatientGroupsPerMeasure(`${measureId}-${allPatientIds.length}`, allPatientIds);
    if (success) {
      console.log(`Group ${measureId}-${allPatientIds.length}-patients successfully created`);
    } else {
      console.log('Group creation failed');
    }
  }
  return 'Group upload finished';
}

main()
  .then(console.log)
  .catch(console.error)
  .finally(async () => await mongoUtil.client.close());
