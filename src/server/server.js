const mongoUtil = require('../util/mongo');
const childProcess = require('child_process');
const os = require('os');

const server = require('./app')({ logger: true });

const start = async () => {
  try {
    await server.listen({ port: process.env.PORT, host: process.env.HOST });
    await mongoUtil.client.connect();
    server.log.info('Connected to the server!');

    if (process.env.EXPORT_WORKERS > os.cpus().length) {
      console.warn(
        `WARNING: Requested to start ${process.env.EXPORT_WORKERS} workers with only ${os.cpus().length} available cpus`
      );
    }

    for (let i = 0; i < process.env.EXPORT_WORKERS; i++) {
      childProcess.fork('./src/server/exportWorker.js');
    }
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
};
start();
