# Bulk Data Generation with Synthea

The [Synthea](https://github.com/synthetichealth/synthea) project can be used to generate realistic (but not real) patient data for use in a testing context. Synthea patient data can be exported according to the FHIR specification but may not be conformant to certain IGs and profiles. The Synthea [Flexporter](https://github.com/synthetichealth/synthea/wiki/Flexporter) can be used to implement mappings during the export process that can add, remove, or update the patient data to be conformant to FHIR profiles.

## Usage

- Download the [Synthea](https://github.com/synthetichealth/synthea) codebase.
- In the Synthea project, use `./run_synthea -fm {mapping file location}` to run synthea with the flexporter.
- You may also use the flexporter standalone to map an existing exported file: `./run_flexporter -fm {mapping file location} -s {source fhir file}`.
- See the [flexporter documentation](https://github.com/synthetichealth/synthea/wiki/Flexporter) for additional information on the flexporter, mapping file, and limitations.

## Validation and Testing
1. Set up updated Synthea functionality
- Functionality from https://github.com/synthetichealth/synthea/pull/1540 is recommended for more diversity in calculations while testing. If not merged, recommend pulling this branch.
-  On your local instance of synthea: in src/main/resources/synthea.properties, uncomment line 301 in order to use the terminology server, and set `exporter.fhir.us_core_version = 3.1.1`.
- Run synthea with the flexporter to generate patient files. Use -p to specify the number of patients, and use -d to specify the directory of any additional modules you would like to run, i.e. `./run_synthea -fm ../../bulk-export-server/synthea/qpp_qicore.yaml -p 100 -d ../../bulk-export-server/synthea/modules/`

2. Use HAPI FHIR validator to validate the patients.
- Use https://github.com/hapifhir/org.hl7.fhir.validator-wrapper/releases/latest/download/validator_cli.jar
- Run with the following options `java -jar validator_cli.jar synthea/output/fhir/ -version 4.0.1 -html-output validation.html -ig http://hl7.org/fhir/us/qicore/ImplementationGuide/hl7.fhir.us.qicore%7C4.1.1 -extension any -display-issues-are-warnings -sct us -clear-tx-cache`
- Most issues are solved by these settings, but some remaining issues that don’t effect calculation may include: "Unknown code 'X9999-"* from the loinc code set

3. Use fqm-execution (or testify) to calculate output patients against measures
- Example run: `npm run cli -- reports -m CMS130-bundle.json --patients-directory ../synthea/output/fhir/ --trust-meta-profile true -o -s 2024-01-01 -e 2024-12-31 --report-type summary`
- Make sure to ignore or delete any non-patient files generated by synthea, such as hospital or practitioner information
- This will give a summary of how many patients fall into each population. For CMS130, there is the expectation of some level of diversity in which populations synthea patients fall into. Other measures may have less diversity in calculated populations until we do further investigation into aligning synthea codes with measure codes.

## Building the Mapping File

Quality Measurement calculation requires data conformant with qicore, an expansive IG, which would require expansive effort to fully map. As such, we can piecemeal address the IG requirements by supporting requirements for individual measures. The recommended process for creating a mapping that addresses a set of measures is:

1. Use [elm-parser-for-ecqms fhir_review branch](https://github.com/projecttacoma/elm-parser-for-ecqms/tree/fhir_review) and get data requirements to build a combined list of mustSupports for all resources across the set of measures.
2. Use [fqm-execution](https://github.com/projecttacoma/fqm-execution) and get data requirements to build a full list of profiles used.
3. For all resource types, ensure resource is exported as a top level resource by Synthea or already supported by the flexporter mapping. If not, use the flexporter `create_resource` action to export the resource based on a logical existing exported resource or based on a logical Synthea module state. Resources that are only used for SDEs may be initially ignored. Make sure all profiles are applied to the correct exported resource.
4. For each must support:
   - Check the resource's [qicore 4.1.1](https://hl7.org/fhir/us/qicore/STU4.1.1/) profile Snapshot Table to check if the mustSupport is also required by the profile (minimum cardinality 1). If not, it may be initially ignored.
   - If required, check if synthea already exports it by looking in the [FhirR4.java](https://github.com/synthetichealth/synthea/blob/master/src/main/java/org/mitre/synthea/export/FhirR4.java) file. You can look for a string like `Condition()` for an example of how the Fhir object is created and what fields are set on it.
   - If Synthea doesn't export it, check if the existing mapping file already adds it through a mapping.
   - If not, fill from something logical that synthea does export (if something logical exists). Understanding what values are logical may involve looking at the FHIR specification and/or the measure's CQL for how the must support field is used in the measure logic.
   - If a logical field doesn't exist, fill from a chosen pre-set value or choose randomly from a limited set of values.

## CMS130 Mapping Example

Below is the example list of resources and must support elements collated from elm-parser-for-ecqms data requirement calculation. Unexported values are marked with a `*` with notes about how their export was resolved in the `qicore_130.yaml` mapping file.

- Condition:
  - "code",
  - "clinicalStatus",
  - "onset",
  - "abatement"
- Coverage: \* exported as a contained resource only -> ignored since Coverage is only used for SDEs
  - "type",
  - "period"
- DeviceRequest: \* not exported -> created based on existing exported Device resources
  - "code",
  - "authoredOn",
  - "status",
  - "intent",
  - "modifierExtension", \* not exported -> ignored since modifierExtension is only used for doNotPerform
  - "modifierExtension.url",
  - "modifierExtension.value"
- Encounter:
  - "status",
  - "type",
  - "period",
  - "diagnosis",\*
  - "diagnosis.condition", \* not exported -> set using a js function that finds conditions that reference this encounter and creates a reference to that condition
  - "hospitalization"
- MedicationRequest:
  - "medication",
  - "doNotPerform", \* not exported -> set to false because all resources exported from Synthea are logically performed
  - "status",
  - "intent",
  - "dosageInstruction",
  - "dispenseRequest", \* not exported -> set from the `authoredOn` field because the measure logic coalesces `dispenseRequest.validityPeriod.start` with `authoredOn` --ignore for now
  - "authoredOn"
- Observation:
  - "code",
  - "value",
  - "effective",
  - "status",
  - "category"
- Procedure:
  - "code",
  - "performed",
  - "status"
- ServiceRequest: \* exported as a contained resource only -> created based on existing exported Procedure resources
  - "code",
  - "authoredOn",
  - "status",
  - "intent"

Below are the additional resources and must support elements likely required for measures based on the Quality Payment Program (QPP).

- AdverseEvent: \* not exported -> created for each Patient resource created
  - "event" \* not exported -> set to a random code from the http://hl7.org/fhir/ValueSet/adverse-event-type ValueSet
- Communication: \* not exported -> created for each Patient resource created
  - "status" \* not exported -> set to `completed`
- CommunicationNotDone: \* not exported -> ignoring for now
  - "statusReason"
- ConditionProblemsHealthConcerns: \* not exported -> using qicore 4.1.1 version's Condition instead
  - "category",
  - "code"
- MedicationAdministration: \* not exported -> created for each Procedure resource created
  - "status", \* not exported -> set to `completed`
  - "medication", \* not exported -> set to a random code from the `http://hl7.org/fhir/ValueSet/medication-codes` ValueSet
  - "effective" \* not exported -> set to the `Procedure.performed` Period
- MedicationAdministrationNotDone: \* not exported -> ignoring for now
  - "statusReason",
  - "medication"
- MedicationDispense: \* not exported -> created for each Procedure resource created
  - "status", \* not exported -> set to `completed`
  - "medication" \* not exported -> set to a random code from the `http://hl7.org/fhir/ValueSet/medication-codes` ValueSet
- MedicationNotRequested: \* not exported, ignoring for now
  - "status",
  - "intent",
  - "medication",
  - "authoredOn",
  - "reasonCode"
- ObservationCanceled: \* not exported -> ignoring for now
  - "extension",
  - "status",
  - "code",
  - "issued"
- ProcedureNotDone: \* not exported -> ignoring for now
  - "status",
  - "code"
- ServiceNotRequested: \* not exported -> ignoring for now
  - "status",
  - "code",
  - "authoredOn"
- SimpleObservation: \* not exported -> ignoring for now
  - "status",
  - "category",
  - "code"
- Task: \* not exported, created for each Procedure resource created where Procedure.performed is of type Period
  - "status", \* not exported -> set to `accepted`
  - "code", \* not exported -> set to a random code from the `http://hl7.org/fhir/ValueSet/task-code` ValueSet
  - "executionPeriod" \* not exported, set to the `Procedure.performed` Period
