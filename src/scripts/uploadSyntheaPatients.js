const fs = require('fs');
const mongoUtil = require('../util/mongo');
const axios = require('axios');
const path = require('path');

async function main() {
  await mongoUtil.client.connect();
  console.log('Connected successfully to server');

  const patientsDir = path.resolve(process.argv[2]);

  const patientRegEx = new RegExp('Patient/[^/]*');
  // store uploaded patientIds to be added as members to FHIR Group (across all patients uploaded so far)
  const allPatientIds = [];

  const directoryFiles = fs.readdirSync(patientsDir);

  // upload practitioner/hospital batch bundles first, if present
  directoryFiles
    .filter(file => file.startsWith('practitioner') || file.startsWith('hospital'))
    .forEach(async file => {
      await axios.post(
        `${process.env.BULK_BASE_URL}/`,
        JSON.parse(fs.readFileSync(path.join(patientsDir, file)), 'utf8')
      ),
        { headers: { 'Content-Type': 'application/json+fhir' } };
    });

  const patientFiles = directoryFiles.filter(
    file =>
      !file.startsWith('practitioner') &&
      !file.startsWith('hospital') &&
      !file.startsWith('group') &&
      !file.startsWith('.DS')
  );

  const promises = [];

  for (const file of patientFiles) {
    console.log(file);
    const fileContents = JSON.parse(fs.readFileSync(path.join(patientsDir, file)), 'utf8');

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
  return 'Patient upload finished';
}

main()
  .then(console.log)
  .catch(console.error)
  .finally(async () => await mongoUtil.client.close());
