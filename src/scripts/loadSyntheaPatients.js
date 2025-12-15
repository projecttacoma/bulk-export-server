const fs = require('fs');
const axios = require('axios');
const path = require('path');
const env = require('dotenv');
const mongoUtil = require('../util/mongo');
const { createResource } = require('../util/mongo.controller');

env.config();

async function main() {
  await mongoUtil.client.connect();
  const patientsDir = path.resolve(process.argv[2]);
  console.log(`Loading patients from directory ${patientsDir} to database.`);

  const patientRegEx = new RegExp('Patient/[^/]*');
  // store uploaded patientIds to be added as members to FHIR Group (across all patients uploaded so far)
  const allPatientIds = [];

  const directoryFiles = fs.readdirSync(patientsDir);

  // upload practitioner/hospital batch bundles first, if present
  const practHospFiles = directoryFiles.filter(file => file.startsWith('practitioner') || file.startsWith('hospital'));
  for (const file of practHospFiles) {
    const fileContents = JSON.parse(fs.readFileSync(path.join(patientsDir, file)), 'utf8');
    for (const res of fileContents.entry) {
      await createResource(res.resource, res.resource.resourceType);
    }
  }
  console.log('Loaded practitioner and hospital info.');

  const patientFiles = directoryFiles.filter(
    file =>
      !file.startsWith('practitioner') &&
      !file.startsWith('hospital') &&
      !file.startsWith('group') &&
      !file.startsWith('.DS') &&
      file.endsWith('.json')
  );

  console.log(`Found ${patientFiles.length} patient files.`);

  const padSize = patientFiles.length.toString().length;
  for (let fileIndex = 0; fileIndex < patientFiles.length; fileIndex++) {
    const file = patientFiles[fileIndex];

    console.log(`${(fileIndex + 1).toString().padStart(padSize, ' ')}/${patientFiles.length} ${file}`);
    const fileContents = JSON.parse(fs.readFileSync(path.join(patientsDir, file)), 'utf8');

    for (const res of fileContents.entry) {
      if (res.resource.resourceType === 'Patient') {
        allPatientIds.push(res.resource.id);
      }
      await createResource(res.resource, res.resource.resourceType);
    }
  }
  return 'Patient load finished';
}

main()
  .then(console.log)
  .catch(err => {
    console.log(`ERROR LOADING PATIENTS: ${err.message.toString()}`);
  })
  .finally(() => mongoUtil.client.close());
