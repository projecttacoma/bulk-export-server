const mongoUtil = require('../util/mongo');

const server = require('./app')({ logger: true });

const start = async () => {
  try {
    await server.listen(3000);
    await mongoUtil.client.connect();
    server.log.info('Connected to the server!');
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
};
start();
