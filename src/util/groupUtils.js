const { createResource } = require('./mongo.controller');
const { createOperationOutcome } = require('./errorUtils');
const { patientAttributePaths } = require('fhir-spec-tools/build/data/patient-attribute-paths');
const _ = require('lodash');
const { addTypeFilter, getDocuments } = require('./exportToNDJson');

/**
 * Creates a FHIR Group resource that represents the Patients associated with a given Measure
 * and adds it to the database
 * @param {string} measureId An id for the associated FHIR Measure to be used in the Group Id
 * @param {Array} patientIds An array of FHIR Patient ids to be added as Group members
 * @returns {Boolean} True if the Group creation succeeds, false otherwise
 */
async function createPatientGroupsPerMeasure(measureId, patientIds) {
  const group = {
    resourceType: 'Group',
    id: `${measureId}-patients`,
    type: 'person',
    actual: true,
    member: patientIds.map(pid => ({
      entity: {
        reference: `Patient/${pid}`
      }
    }))
  };
  try {
    await createResource(group, 'Group');
    return true;
  } catch (e) {
    if (e.code !== 11000) {
      console.log(e.message);
    }
    return false;
  }
}

/**
 * Verifies that all patients specified in the "patient" parameter are members of the group, for a
 * given group export. Throws a 404 error wrapped in an OperationOutcome if any patients are specified
 * that do *not* belong to the group.
 * @param {Array} patientParam array of patient references
 * @param {string} groupId identifier for the FHIR Group resource
 * @param {string[]} groupMembers array of group member references (i.e. `Patient/123`)
 * @param {Object} reply the response object
 */
function verifyPatientsInGroup(patientParam, groupId, groupMembers, reply) {
  const unknownPatientReferences = [];

  patientParam.forEach(p => {
    if (!groupMembers.find(member => member === p.reference)) {
      unknownPatientReferences.push(p.reference);
    }
  });

  if (unknownPatientReferences.length > 0) {
    const errorMessage = `The following patient ids are not members of the group ${groupId}: ${unknownPatientReferences.join(
      ', '
    )}`;
    reply.code(404).send(createOperationOutcome(errorMessage, { issueCode: 404, severity: 'error' }));
  }
  return false;
}

/**
 * Applicable to a non-actual group to determine members
 * @param {Object} group FHIR group resource
 * @param {Object} reply the response object
 * @returns {string[]} array of group member references (i.e. `Patient/123`)
 */
async function actualizeGroup(group, reply) {
  // TODO: actualize group references i.e. ['Patient/123']
  const filters = group.modifierExtension.filter(
    me => me.url === 'http://hl7.org/fhir/uv/bulkdata/StructureDefinition/member-filter'
  );
  const expressions = filters
    .filter(f => f.valueExpression.language === `application/x-fhir-query`)
    .map(f => f.valueExpression.expression);
  if (expressions.length < filters.length) {
    // a client SHALL use a single language type for all of the member-filter expressions included in a single Group
    reply.code(404).send(
      createOperationOutcome('Member filters must use value expression language: "application/x-fhir-query"', {
        issueCode: 400,
        severity: 'error'
      })
    );
  }
  // populated with a FHIR REST API query for a resource type included in the Patient or Practitioner compartment
  //... find resources (ORd together if same resource type, ANDed if different resource type), then find all patients with references to those resources

  // how would FHIR queries do the OR'd part  - probably can't create one big long query - > do it by hand
  // we have no current search implementation here - how do we handle :in's, typefilter logic?

  // 1. collect query expressions by resource type
  // 2. pretend they're ANDed type filters
  // 3. collect all of the resources of that type according to typefilter logic
  // structure... Encounter: [list of encounters that the patient could reference]
  // 4. use the compartment definition resources to look up how this encounter could be referenced in patient ('subject')
  // 5. Map encounter set to referenced patient set: e => getId(e.subject).uniq
  // 6. Find the intersection of all patient sets

  //1
  const resourceMap = {};
  expressions.forEach(e => {
    const resourceType = e.split('?')[0];
    if (resourceMap[resourceType]) {
      resourceMap[resourceType].push(e);
    } else {
      resourceMap[resourceType] = [e];
    }
  });

  const patientSets = await Promise.all(
    Object.keys(resourceMap).map(async k => {
      //2,3
      const expResources = await findExpressionResources(k, resourceMap[k]);
      //4,5
      const patientRefs = expResources.flatMap(expRes => {
        // example: expRes is AllergyIntolerance instance A
        // creates an array of defined values for [A.asserter,A.patient,A.recorder]
        return patientAttributePaths[k].filter(path => expRes[path]).map(path => expRes[path].reference);
      });

      return _.uniq(patientRefs);
    })
  );

  //6
  return _.intersection(...patientSets);
}

/**
 * Applicable to a non-actual group to determine members
 * @param {string[]} expArr list of expressions that should be OR'd together to find resources (of the same type)
 * @returns {Object[]} array of resources that match one of the expressions
 */
async function findExpressionResources(resourceType, expArr) {
  const searchParameterQueries = {};
  const valueSetQueries = {};
  addTypeFilter(expArr, searchParameterQueries, valueSetQueries);

  const docs = await getDocuments(
    resourceType,
    searchParameterQueries[resourceType],
    valueSetQueries[resourceType],
    null,
    null
  ).document;
  console.log(`??? document ??? ${docs}`);
  return docs;
}

module.exports = { createPatientGroupsPerMeasure, verifyPatientsInGroup, actualizeGroup };
