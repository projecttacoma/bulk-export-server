const { v4: uuidv4 } = require('uuid');
const { patientAttributePaths } = require('fhir-spec-tools/build/data/patient-attribute-paths');
const patientResourceTypes = Object.keys(patientAttributePaths);
const { addTypeFilter, getDocuments } = require('./exportToNDJson');
const _ = require('lodash');

/**
 * Creates a patient bundle resource. Creates using a patient resource and
 * an array of the patient's associated resources
 * @param {Object} patient FHIR Patient object
 * @param {Array} resources array of resources associated with the patient
 * @param {Array} measureReports array of MeasureReport specifying measure information for data exchange
 * @returns {Object} a FHIR patient bundle resource
 */
function createPatientBundle(patient, resources, measureReports) {
  const bundle = {
    type: 'transaction',
    resourceType: 'Bundle',
    id: uuidv4(),
    entry: []
  };
  resources.forEach(r => {
    bundle.entry?.push({
      resource: r,
      request: {
        method: 'PUT',
        url: `${r.resourceType}/${r.id}`
      },
      fullUrl: r.fullUrl ?? `urn:uuid:${r.id}`
    });
  });

  measureReports.forEach(measureReport => {
    bundle.entry?.push({
      resource: measureReport,
      request: {
        method: 'PUT',
        url: `MeasureReport/${measureReport.id}`
      },
      fullUrl: measureReport.fullUrl ?? `urn:uuid:${measureReport.id}`
    });
  });

  return bundle;
}

/**
 * Creates a FHIR data exchange MeasureReport from measure and subject data
 * https://build.fhir.org/ig/HL7/davinci-deqm/StructureDefinition-datax-measurereport-deqm.html
 * @param measure FHIR Measure
 * @param measurementPeriod FHIR Period representing the measurement period
 * @param subjectId the patient id the MeasureReport is associated with
 * @returns { fhir4.MeasureReport } a data exchange measure report used to send Measure-relevant data to a server
 */
function createDataExchangeMeasureReport(measure, measurementPeriod, subjectId, patientResources) {
  return {
    resourceType: 'MeasureReport',
    id: uuidv4(),
    measure: measure.url?.includes('|') ? measure.url : `${measure.url}|${measure.version}`, //canonical measure/version
    period: measurementPeriod,
    status: 'complete',
    type: 'data-collection',
    subject: { reference: `Patient/${subjectId}` },
    date: jsDateToFHIRDate(new Date()),
    reporter: { reference: 'Organization/bulk-export-server' }, //TODO: do we need to send an organization resource?
    meta: {
      profile: ['http://hl7.org/fhir/us/davinci-deqm/StructureDefinition/datax-measurereport-deqm']
    },
    extension: [
      {
        url: 'http://hl7.org/fhir/us/davinci-deqm/StructureDefinition/extension-submitDataUpdateType',
        valueCode: 'snapshot'
      }
    ],
    evaluatedResource: patientResources.map(r => {
      return { reference: `${r.resourceType}/${r.id}` };
    }),
    contained: [{ resourceType: 'Organization', id: 'bulk-export-server' }]
  };
}

/**
 * Converts a JS date to a FHIR date string
 * @param {Date} date JS date to be converted
 * @returns {String} a string representing a FHIR date
 */
function jsDateToFHIRDate(date) {
  // TODO: Just use .toISOString()???
  const year = date.getFullYear();
  // month is 0 indexed
  const month = date.getMonth() + 1;
  const day = date.getDate();
  return `${year}-${month < 10 ? `0${month}` : month}-${day < 10 ? `0${day}` : day}`;
}

/**
 * Finds all resources related to the passed patient resource but limited by the data requirements on the passed measure
 * @param {Object} patient fhir patient resource
 * @param {Object} measure fhir measure resource
 * @returns {Array} an array of filtered fhir resources related to the passed patient
 */
async function findPatientResources(patient, measure) {
  const dataRequirements = measure.contained.find(c => c.id === 'effective-data-requirements').dataRequirement;
  const types = _.uniq(dataRequirements.map(dr => dr.type)); //patientResourceTypes; //TODO: make sure that resulting types are in patientResourceTypes if we think that's useful? throw error
  const [patientTypes, nonPatientTypes] = types.reduce(
    ([patient, nonPatient], type) => {
      (patientResourceTypes.includes(type) ? patient : nonPatient).push(type);
      return [patient, nonPatient];
    },
    [[], []]
  );
  console.warn('Ignoring non-patient types found in data requirements:', nonPatientTypes);
  const typeFilters = typeFiltersForMeasure(dataRequirements);
  // create lookup objects for (1) _typeFilter queries that contain search parameters, and (2) _typeFilter
  // queries that contain type:in/code:in/etc. queries
  const searchParameterQueries = {};
  const valueSetQueries = {};
  if (typeFilters) {
    addTypeFilter(typeFilters, searchParameterQueries, valueSetQueries);
  }

  // for each patient, collect resource documents from each export type collection
  const typeDocs = patientTypes.map(async collectionName => {
    return (
      await getDocuments(collectionName, searchParameterQueries[collectionName], valueSetQueries[collectionName], [
        patient.id
      ])
    ).document;
  });

  //flatten all type arrays into a single array
  return (await Promise.all(typeDocs)).flat();
}

function typeFiltersForMeasure(dataRequirements) {
  // create record resourcetype => [] of valid typeFilter query strings that will be separated by "&" and logically handled as ORs
  const typeFilters = {};
  dataRequirements.forEach(dr => {
    //empty array is general _type query that overrides a more specific _typeFilter
    if (typeFilters[dr.type]?.length === 0) return;
    // TODO: add profile conformance checking as specified in the data requirement

    if (
      dr.codeFilter?.some(cf => {
        const hasVS = cf.path && cf.valueSet;
        const hasCode = cf.path && cf.code && cf.code.every(coding => !!coding.code);
        const hasNeither = !hasVS && !hasCode;
        return hasNeither;
      })
    ) {
      // if any codeFilter for a data requirement doesn't have sufficient information, default to getting all for that type (general _type query)
      typeFilters[dr.type] = [];
      return;
    }
    //all codefilters have a path and proper code and can be added to our typefilter array
    const fhirQueries = dr.codeFilter?.map(cf => {
      const hasVS = cf.path && cf.valueSet;
      const hasCode = cf.path && cf.code && cf.code.every(coding => !!coding.code);
      if (hasVS && hasCode) {
        // TODO: Is there a right way to do this case?
        // filter returns items matching a code in the value set or one of the specified codes
        // ORing these things together at this level doesn't seem to have a specified approach in https://hl7.org/fhir/R4/search.html#combining
        // Try appending codes after vs url for lack of a better idea (i.e. type:in=[ValueSet-canonical-URL],1,2). This is almost definitely wrong
        return `${cf.path}:in=${cf.valueSet},${cf.code?.map(coding => coding.code).join(',')}`;
      } else if (hasVS) {
        return `${cf.path}:in=${cf.valueSet}`;
      } else {
        // hasCode
        return `${cf.path}=${cf.code?.map(coding => coding.code).join(',')}`;
      }
    }); // potential multiple codes are comma-separated to be ORed for this path
    const tfStr = `${dr.type}?${fhirQueries?.join('&')}`; //Example value: 'Procedure?code=1,2&category=3,4'
    if (typeFilters[dr.type]) {
      typeFilters[dr.type]?.push(tfStr);
    } else {
      typeFilters[dr.type] = [tfStr];
    }
  });

  // array of typeFilters that should be treated as OR'd (empty array will be ignored and flattened)
  return Object.values(typeFilters).flat();
}

// version with code=value only typeFilters
// export function typeFiltersForMeasure(dataRequirements){
//   // create record resourcetype => [] of valid typeFilter query strings that will be separated by "&" and logically handled as ORs
//   const typeFilters = {};
//   dataRequirements.results.dataRequirement?.forEach(dr => {
//     //empty array is general _type query that overrides a more specific _typeFilter
//     if (typeFilters[dr.type]?.length === 0) return;

//     //any codeFilter that's non-coded or no-path or any contained codings have no code -> results in a general _type query
//     if (dr.codeFilter?.some(cf => !cf.code || !cf.path || cf.code.some(coding => !coding.code))) {
//       typeFilters[dr.type] = [];
//       return;
//     }
//     //all codefilters have a path and proper code and can be added to our typefilter array
//     const fhirQueries = dr.codeFilter?.map(cf => `${cf.path}=${cf.code?.map(coding => coding.code).join(',')}`); // potential multiple codes are comma-separated to be ORed for this path
//     const tfStr = `${dr.type}?${fhirQueries?.join('&')}`; //Example value: 'Procedure?code=1,2&category=3,4'
//     if (typeFilters[dr.type]) {
//       typeFilters[dr.type]?.push(tfStr);
//     } else {
//       typeFilters[dr.type] = [tfStr];
//     }
//   });

//   // array of typeFilters that should be treated as OR'd (empty array will be ignored and flattened)
//   return Object.values(typeFilters).flat();

// // Examples
//     // MedicationRequest?status=completed&date=gt2018-07-01T00:00:00Z
//     // MedicationRequest?type:in=[ValueSet-canonical-URL]
//     // Observation?code=http://loinc.org|1234-5 or Observation?code=1234-5

// }

/**
 * Helper function that takes in a Patient object and a Measure object and uses the
 * measure data requirements to identify all Patient data relevant to the measure
 * Note: Uses measure's effective data requirements library
 */

// The below approach starts with all patient-related resources and filters down from there
// bulkQueries from https://github.com/projecttacoma/fqm-bulk-utils/pull/2 creates queries that are fairly
// generic (might not narrow enough) and may not be effective on the server?
//

// export function minimalResources(patient, measure){
//   const newResources = testCase.resources.filter(r => {
//     // throw out any resources that are not in any of the dataRequirements
//     // iterate over every resource in each bundle
//     if (r.resource && r.resource?.resourceType) {
//       // see if it matches any data requirements in the lookup object
//       const matchingDRType = drLookupByType[r.resource.resourceType];
//       if (matchingDRType) {
//         const codeInfo = parsedCodePaths[r.resource.resourceType];
//         // if the matching resource type's lookup object has keepAll set to true, meaning
//         // the codeFilter on the data requirement was undefined, keep any resources of that type
//         if (matchingDRType.keepAll === true) {
//           return true;
//         } else if (codeInfo.primaryCodePath) {
//           const primaryCodeInfo = codeInfo.paths[codeInfo.primaryCodePath];

//           if (primaryCodeInfo.codeType === 'FHIR.CodeableConcept') {
//             if (primaryCodeInfo.choiceType === true) {
//               if (primaryCodeInfo.multipleCardinality === true) {
//                 // not sure if this happens based on codePaths.ts
//               } else {
//                 // example: MedicationRequest, DeviceRequest
//                 const primaryCodeValue = fhirpath.evaluate(
//                   r.resource,
//                   `${codeInfo.primaryCodePath}CodeableConcept`
//                 )[0] as fhir4.CodeableConcept;
//                 const matchingCode = checkCodesAndValueSets(primaryCodeValue, matchingDRType, measureBundle);
//                 if (matchingCode) {
//                   return true;
//                 }
//               }
//             } else {
//               if (primaryCodeInfo.multipleCardinality === true) {
//                 // example: Activity Definition, Appointment, Encounter
//                 const primaryCodeValue = fhirpath.evaluate(
//                   r.resource,
//                   codeInfo.primaryCodePath
//                 ) as fhir4.CodeableConcept[];
//                 if (primaryCodeValue) {
//                   if (primaryCodeValue.some(pcv => checkCodesAndValueSets(pcv, matchingDRType, measureBundle))) {
//                     return true;
//                   }
//                 }
//               } else {
//                 const primaryCodeValue = fhirpath.evaluate(
//                   r.resource,
//                   codeInfo.primaryCodePath
//                 )[0] as fhir4.CodeableConcept;
//                 const matchingCode = checkCodesAndValueSets(primaryCodeValue, matchingDRType, measureBundle);
//                 if (matchingCode) {
//                   return true;
//                 }
//               }
//             }
//           } else if (primaryCodeInfo.codeType === 'FHIR.Coding') {
//             if (primaryCodeInfo.choiceType === true) {
//               if (primaryCodeInfo.multipleCardinality === true) {
//                 // not sure if this happens based on codePaths.ts
//               } else {
//                 // example: MessageDefinition
//                 const primaryCodeValue = fhirpath.evaluate(
//                   r.resource,
//                   `${codeInfo.primaryCodePath}Coding`
//                 ) as fhir4.Coding;
//                 if (primaryCodeValue) {
//                   if (
//                     matchingDRType.directCodes.length > 0 &&
//                     matchingDRType.directCodes.some(
//                       dc => dc.code === primaryCodeValue.code && dc.system === primaryCodeValue.system
//                     )
//                   ) {
//                     return true;
//                   } else if (matchingDRType.valueSets.length > 0) {
//                     const vsCodesAndSystems = getValueSetCodes(matchingDRType.valueSets, measureBundle);
//                     if (
//                       vsCodesAndSystems.some(
//                         vscas => primaryCodeValue.code === vscas.code && primaryCodeValue.system === vscas.system
//                       )
//                     ) {
//                       return true;
//                     }
//                   }
//                 }
//               }
//             } else {
//               // not sure if this happens based on codePaths.ts
//             }
//           } else if (primaryCodeInfo.codeType === 'FHIR.code') {
//             if (primaryCodeInfo.choiceType === true) {
//               if (primaryCodeInfo.multipleCardinality === true) {
//                 // not sure if this happens based on codePaths.ts
//               } else {
//                 // not sure if this happens based on codePaths.ts
//               }
//             } else {
//               if (primaryCodeInfo.multipleCardinality === true) {
//                 // example: SearchParameter
//               } else {
//                 // example: OperationDefinition
//               }
//             }
//           }
//         }
//       }
//     }
//     return false;
//   });
//   return newResources;
// }

module.exports = { createPatientBundle, createDataExchangeMeasureReport, findPatientResources };
