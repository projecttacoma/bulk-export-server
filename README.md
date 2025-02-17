# bulk-export-server

- [Installation](#installation)

  - [Prerequisites](#prerequisites)
  - [Local Installation](#local-installation)
  - [Testing](#testing)
  - [MongoDB](#mongodb)
  - [Redis Installation](#redis-installation)
  - [Docker](#docker)

- [Usage](#usage)

- [Server Endpoints](#server-endpoints)

- [License](#license)

## Installation

### Prerequisites

- [Node.js >=16.11.0](https://nodejs.org/en/)
- [MongoDB >= 5.0](https://www.mongodb.com)
- [Git](https://git-scm.com/)
- [Docker](https://docs.docker.com/get-docker/)
- [Redis](https://redis.com/break-the-data-matrix/)

### Local Installation

Clone the source code:

```bash
git clone https://github.com/projecttacoma/bulk-export-server.git
```

Install dependencies:

```bash
npm install
```

### Testing

Unit tests can be running using the following `npm` command:

```bash
npm run test
```

### MongoDB

This server makes use of [MongoDB](https://www.mongodb.com), a cross-platform document-oriented database program.

Follow the [MongoDB Community Edition installation guide](https://docs.mongodb.com/manual/installation/) for your platform, and follow the commands for running MongoDB on your machine.

### Redis Installation

This server uses [Redis](https://redis.com/break-the-data-matrix/) in order to use the [bee queue](https://github.com/bee-queue/bee-queue) Node.js queue library. To install with Homebrew, run the following command:

```bash
brew install redis
```

To launch Redis, run:

```bash
brew services start redis
```

To verify the Redis server is running, ping it with:

```bash
redis-cli ping
```

You should receive the output `PONG`.

### Docker

This test server can be run with Docker by calling `docker compose up --build`.
Debugging with terminal input can be facilitated with `stdin_open: true` and `tty: true` added to the service specification for the service you want to debug. You can then attach to the image of interest using `docker attach <imagename>`. If you're unsure of the image name, use `docker ps` to find the image of interest.

#### Building new Docker Images

If you have permission to push to the tacoma organization on Docker Hub, simply run `docker-build.sh` to build a multi-platform image and push to docker hub tagged as `latest`.

## Usage

Once MongoDB is running on your machine, run the `npm start` command to start up the FHIR server at `localhost:3001`. The server can also be run in "watch" mode with `npm run start:watch`.

For ease of testing, it is recommended to download [Insomnia API Client and Design Tool](https://insomnia.rest) for sending HTTP requests to the server and [Robo 3T](https://robomongo.org) as a GUI for viewing the Mongo database.

#### Database Setup

The following `npm` commands can be used to set up the database:

- `npm run db:setup` creates collections for all the valid FHIR resource types
- `npm run db:delete` deletes all existing collections in the database
- `npm run db:reset` runs both of the above, deleting all current collections and then creating new, empty collections
- To upload all the ecqm-content-r4-2021 measure bundles, `git clone` the [ecqm-content-r4-2021 repo](https://github.com/cqframework/ecqm-content-r4-2021) into the root directory of the `bulk-export-server` repository. Run `npm run upload-bundles`. This runs a script that uploads all the measure bundle resources to the appropriate Mongo collections.
- The full CLI function signature of `upload-bundles` script is `npm run upload-bundles [dirPath] [searchPattern]`. The command can be run more dynamically by specifying a `dirPath` string which represents the path to a repository that contains the desired bundles for upload. `searchPattern` is a string which is used as a regex to filter bundle files for upload by file name. Example: `npm run upload-bundles connectathon/fhir401/bundles/measure "^EXM124.*-bundle.json"`

### Transaction Bundle Upload

The server supports transaction bundle uploads.

- The request method must be `POST`.
- The request body must be a FHIR bundle of type `transaction`.

For ease of use, the `directory-upload.sh` script can be used to run the transaction bundle upload on an input directory. Details are as follows:

- The `-h` option can be used ot view usage.
- A server URL must be supplied via the `-s` option.
- A directory path must be supplied via the `-d` option.
- The script can support nested directories (one level deep).

## Server Endpoints

The server supports the following endpoints:

#### All Patients

FHIR Operation to obtain a detailed set of FHIR resources of diverse resource types pertaining to all patients.

Endpoint: `GET [fhir base]/Patient/$export`

Alternatively, a POST request (`POST [fhir base]/Patient/$export`) can be sent. The export parameters must be supplied using a FHIR [Parameters Resource](http://hl7.org/fhir/R4/parameters.html) in the request body.

#### All Patients in a Group

FHIR Operation to obtain a detailed set of FHIR resources of diverse resource types pertaining to all patients that belong to a defined Group resource.

Endpoint: `GET [fhir base]/Group/[id]/$export`

Alternatively, a POST request (`POST [fhir base]/Group/[id]/$export`) can be sent. The export parameters must be supplied using a FHIR [Parameters Resource](http://hl7.org/fhir/R4/parameters.html) in the request body.

#### System Level Export

Export data from a FHIR server, whether or not it is associated with a patient. This supports use cases like backing up a server, or exporting terminology data by restricting the resources returned using the `_type` parameter.

Endpoint: `GET [fhir base]/$export`

Alternatively, a POST request (`POST [fhir base]/$export`) can be sent. The export parameters must be supplied using a FHIR [Parameters Resource](http://hl7.org/fhir/R4/parameters.html) in the request body.

For more information on the export endpoints, read this documentation on the [Export Request Flow](https://hl7.org/fhir/uv/bulkdata/export.html#bulk-data-export-operation-request-flow).

#### Bulk Status

This server supports the bulk status endpoint in support of the [Export Request Flow](https://hl7.org/fhir/uv/bulkdata/export.html#bulk-data-export-operation-request-flow).

Endpoint: `GET [fhir base]/bulkstatus/[client id]`

The server additionally supports a related convenience endpoint which kicks off an `$import` operation for an existing export request. The exported data is selected for import to a data receiver server. This import server location should be specifed with parameters using a FHIR [Parameters Resource](http://hl7.org/fhir/R4/parameters.html) with name `receiver` in the request body. The server will respond with the same bulk status information according to the progress of the existing export workflow.

Endpoint: `POST [fhir base]/bulkstatus/[client id]/kickoff-import`

## Supported Query Parameters

The server supports the following query parameters:

From the [2.0.0 ci-build version of the Bulk Data Access IG](https://build.fhir.org/ig/HL7/bulk-data/export.html#query-parameters):

- `_type`: Filters the response to only include resources of the specified resource type(s)
  - If omitted, system-level requests will return all resources supported by the server within the scope of the client authorization
  - For Patient- and Group-level requests, the [Patient Compartment](https://www.hl7.org/fhir/compartmentdefinition-patient.html) is used as a point of reference for filtering the resource types that are returned.
- `_outputFormat`: The server supports the following formats: `application/fhir+ndjson`, `application/ndjson+fhir`, `application/ndjson`, `ndjson`
- `_typeFilter`: Filters the response to only include resources that meet the criteria of the specified comma-delimited FHIR REST queries. Returns an error for queries specified by the client that are unsupported by the server. Supports queries on the ValueSets (`type:in`, `code:in`, etc.) of a given resource type.
- `patient`: Only applicable to POST requests for group-level and patient-level requests. When provided, the server SHALL NOT return resources in the patient compartment definition belonging to patients outside the list. Can support multiple patient references in a single request.
- `_elements`: Filters the content of the responses to omit unlisted, non-mandatory elements from the resources returned. These elements should be provided in the form `[resource type].[element name]` (e.g., `Patient.id`) which only filters the contents of those specified resources or in the form `[element name]` (e.g., `id`) which filters the contents of all of the returned resources.

From the [2.0.0 ci-build version of the argo24 branch of the Bulk Data Access IG](https://build.fhir.org/ig/HL7/bulk-data/branches/argo24/export.html#query-parameters):

- `organizeOutputBy`: Applicable for all types of export requests. Creates export results, separating resources into files based on what resourceType they are to be organized by. The only `organizeOutputBy` value supported currently is `Patient`. This will result in an ndjson file for each patient in the returned data. If the `_type` parameter is used in conjunction with this parameter, `Patient` must be one of the types included in the passed value lists. Note: in this server's implementation, resources that would otherwise be included in the export, but do not have references to resource type `Patient` are omitted from the export, following guidance from the IG's [Bulk Data Output File Organization](https://build.fhir.org/ig/HL7/bulk-data/branches/argo24/export.html#bulk-data-output-file-organization).

#### `_elements` Query Parameter

The server supports the optional and experimental query parameter `_elements` as defined by the Bulk Data Access IG (here)[https://build.fhir.org/ig/HL7/bulk-data/export.html#query-parameters]. The `_elements` parameter is a string of comma-delimited HL7® FHIR® Elements used to filter the returned resources to only include listed elements and mandatory elements. Mandatory elements are defined as elements in the StructureDefinition of a resource type which have a minimum cardinality of 1. Because this server provides json-formatted data, `resourceType` is also an implied mandatory element for all Resources.

The returned resources are only filtered by elements that are applicable to them. For example, if a request looks like the following:

```
GET http://localhost:3000/$export?_elements=Condition.id
```

Then the returned resources should contain everything on them except the returned Conditions should only contain an `id` (if applicable) and any mandatory elements.

If a request does not specify a resource type, such as the following:

```
GET http://localhost:3000/$export?_elements=id
```

Then all returned resources should only contain an `id` (if applicable) and any mandatory elements.

## License

Copyright 2021-2023 The MITRE Corporation

Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License. You may obtain a copy of the License at

```bash
http://www.apache.org/licenses/LICENSE-2.0
```

Unless required by applicable law or agreed to in writing, software distributed under the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the License for the specific language governing permissions and limitations under the License.
