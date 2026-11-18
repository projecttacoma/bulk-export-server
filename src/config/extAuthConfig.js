const fs = require('node:fs/promises');
const path = require('node:path');
const yaml = require('yaml');
const { z } = require('zod');

const JwtAuthConfigSchema = z.object({
  type: z.literal('jwt'),
  url: z.string(),
  authUrl: z.string(),
  clientId: z.string()
});

const SecretAuthConfigSchema = z.object({
  type: z.literal('secret'),
  url: z.string(),
  authUrl: z.string(),
  clientId: z.string(),
  clientSecret: z.string()
});

const TokenAuthConfigSchema = z.object({
  type: z.literal('token'),
  url: z.string(),
  token: z.string()
});

const ExtAuthConfigSchema = z.discriminatedUnion('type', [
  JwtAuthConfigSchema,
  SecretAuthConfigSchema,
  TokenAuthConfigSchema
]);

const ConfigSchema = z.object({
  servers: z.array(ExtAuthConfigSchema)
});

async function loadAuthConfig() {
  if (!process.env.AUTH_CONFIG_FILE) {
    console.warn('No AUTH_CONFIG_FILE environment variable specified.');
    return [];
  }

  const configPath = path.resolve(process.env.AUTH_CONFIG_FILE);
  try {
    const file = await fs.readFile(configPath, 'utf8');
    const config = ConfigSchema.parse(yaml.parse(file));
    return config.servers;
  } catch (error) {
    console.warn(`Could not load external auth config from ${configPath}.`, error);
    return [];
  }
}

/**
 * Look up a server's external authentication configuration by FHIR base URL, ignoring trailing slashes.
 * AUTH_CONFIG_FILE points to a YAML file containing a servers array.
 * @param {string} url the FHIR base URL
 * @returns {Promise<Object|undefined>} the matching configuration, if present
 */
async function getExtAuthConfig(url) {
  console.info(`Finding auth config for "${url}"`);
  const config = await loadAuthConfig();
  return config.find(config => config.url.replace(/\/+$/, '') === url.replace(/\/+$/, ''));
}

module.exports = {
  JwtAuthConfigSchema,
  SecretAuthConfigSchema,
  TokenAuthConfigSchema,
  ExtAuthConfigSchema,
  ConfigSchema,
  getExtAuthConfig
};
