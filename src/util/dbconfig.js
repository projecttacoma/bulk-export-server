const env = require('dotenv');

if (process.env.NODE_ENV == 'test') {
  env.config({ path: './.env.test' });
} else {
  env.config();
}
