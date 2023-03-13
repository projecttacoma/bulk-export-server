const axios = require('axios');
const path = require('path');
const fs = require('fs');
const { createPatientGroupsPerMeasure } = require('../util/groupUtils');
const mongoUtil = require('../util/mongo');

/**
 * Uploads all transaction bundles from the specified directory
 * into the database. Creates a group resource containing
 * all the patients (with their updated ids that are created
 * during the transaction bundle upload process) in the process.
 * Uploads the created group resource to the database.
 */
async function main() {
  const bundlePath = path.resolve(process.argv[2]);
  const groupId = process.argv[3];
  const directoryFiles = fs.readdirSync(bundlePath);
  // store uploaded patientIds to be added as members to FHIR Group
  const patientRegEx = new RegExp('Patient/[^/]*');

  const patientIdsArray = directoryFiles.map(async file => {
    const { data } = await axios.post(
      `http://${process.env.HOST}:${process.env.PORT}/`,
      JSON.parse(fs.readFileSync(path.join(bundlePath, file), 'utf8')),
      { headers: { 'Content-Type': 'application/json+fhir' } }
    );

    const location = data.entry.find(e => e.response.location.startsWith('/Patient'));
    if (patientRegEx.test(location.response.location)) {
      return location.response.location.replace('/Patient/', '');
    }
  });
  const patientIds = await Promise.all(patientIdsArray);
  createPatientGroupsPerMeasure(groupId, patientIds);
  return `Group ${groupId}-patients successfully created`;
}

main()
  .then(console.log)
  .catch(console.error)
  .finally(async () => await mongoUtil.client.close());
