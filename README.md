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

- [Node.js >=11.15.0](https://nodejs.org/en/)
- [MongoDB >= 5.0](https://www.mongodb.com)
- [Git](https://git-scm.com/)
- [Docker](https://docs.docker.com/get-docker/)
- [Redis](https://redis.com/break-the-data-matrix/)

### Local Installation

Clone the source code:

```bash
git clone https://github.com/projecttacoma/deqm-test-server.git
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

This test server can be run with Docker by calling `docker-compose up --build`.
Debugging with terminal input can be facilitated with `stdin_open: true` and `tty: true` added to the service specification for the service you want to debug. You can then attach to the image of interest using `docker attach <imagename>`. If you're unsure of the image name, use `docker ps` to find the image of interest.

## Usage

Once MongoDB is running on your machine, run the `npm start` command to start up the FHIR server at `localhost:3000`. The server can also be run in "watch" mode with `npm run start:watch`.

For ease of testing, it is recommended to download [Insomnia API Client and Design Tool](https://insomnia.rest) for sending HTTP requests to the server and [Robo 3T](https://robomongo.org) as a GUI for viewing the Mongo database.

## Server Endpoints

The server supports the following endpoints:

#### All Patients

FHIR Operation to obtain a detailed set of FHIR resources of diverse resource types pertaining to all patients.

Endpoint: `GET [fhir base]/Patient/$export`

#### System Level Export

Export data from a FHIR server, whether or not it is associated with a patient. This supports use cases like backing up a server, or exporting terminology data by restricting the resources returned using the `_type` parameter.

Endpoint: `GET [fhir base]/$export`

For more information on the export endpoints, read this documentation on the [Export Request Flow](https://hl7.org/fhir/uv/bulkdata/export/index.html#request-flow).

## License

Copyright 2021 The MITRE Corporation

Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License. You may obtain a copy of the License at

```bash
http://www.apache.org/licenses/LICENSE-2.0
```

Unless required by applicable law or agreed to in writing, software distributed under the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the License for the specific language governing permissions and limitations under the License.
