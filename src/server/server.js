const mongoUtil = require('../util/mongo');

const server = require('./app')({ logger: { prettyPrint: true } });

const start = async () => {
  try {
    await server.listen(process.env.PORT, process.env.HOST);
    await mongoUtil.client.connect();
    server.log.info('Connected to the server!');
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
};
start();
