const axios = require('axios');
const jose = require('node-jose');
const { existsSync } = require('node:fs');
const fs = require('node:fs/promises');
const { v4 } = require('uuid');
const { getExtAuthConfig } = require('../config/extAuthConfig');
const privateKeyFile = process.env.JWT_PRIVATE_KEY_FILE;
const SUPPORTED_ALGORITHMS = ['ES384', 'RS384'];
// if a token expires in this many ms or sooner, don't use it, fetch a new one
const TOKEN_EXP_BUFFER_MS = 1000;
const TOKEN_MAP = new Map();
// Keep one in-flight authentication request per FHIR base URL so those queries share
// a result instead of each obtaining a token.
const TOKEN_REQUESTS = new Map();

// See original at https://github.com/projecttacoma/deqm-test-server/blob/main/src/util/tokenManager.ts
class TokenManager {
  static invalidate(fhirBaseUrl, rejectedBearerToken) {
    const currentToken = TOKEN_MAP.get(fhirBaseUrl);
    if (rejectedBearerToken == null || currentToken?.bearerToken === rejectedBearerToken) {
      TOKEN_MAP.delete(fhirBaseUrl);
    }
  }
  static async getToken(fhirBaseUrl, force = false) {
    const previousToken = TOKEN_MAP.get(fhirBaseUrl);
    if (previousToken != null && !force) {
      const expired = Date.now() + TOKEN_EXP_BUFFER_MS > previousToken.expiresAtMs;
      if (!expired) {
        return previousToken;
      }
      this.invalidate(fhirBaseUrl);
    }
    const pendingRequest = TOKEN_REQUESTS.get(fhirBaseUrl);
    if (pendingRequest) {
      return pendingRequest;
    }
    const tokenRequest = this.acquireToken(fhirBaseUrl);
    TOKEN_REQUESTS.set(fhirBaseUrl, tokenRequest);
    try {
      return await tokenRequest;
    } finally {
      TOKEN_REQUESTS.delete(fhirBaseUrl);
    }
  }
  static async acquireToken(fhirBaseUrl) {
    const authConfig = await getExtAuthConfig(fhirBaseUrl);
    const { clientId, authUrl: customEndpoint, customScopes } = authConfig?.type === 'jwt' ? authConfig : {};
    // TODO, if unknown server return null
    if (clientId == null) {
      return null;
    }
    const tokenEndpoint = customEndpoint ?? (await getTokenEndpoint(fhirBaseUrl));
    console.debug(`using tokenEndpoint ${tokenEndpoint}`);
    // generate the signed JWT first
    const jwt = await generateJWT(clientId, tokenEndpoint);
    console.debug(`constructed JWT ${jwt}`);
    // get the bearer token
    const rawToken = await getAccessToken(tokenEndpoint, jwt.toString(), customScopes);
    console.debug(`got token: ${rawToken.access_token}`);
    const tokenState = {
      bearerToken: formatBearerToken(rawToken.access_token),
      // expires_in is time until expiration in seconds, Date.now() is in milliseconds
      expiresAtMs: Date.now() + rawToken.expires_in * 1000,
      tokenEndpoint
    };
    TOKEN_MAP.set(fhirBaseUrl, tokenState);
    return tokenState;
  }
}
function formatBearerToken(accessToken) {
  return /^Bearer\s/i.test(accessToken) ? accessToken : `Bearer ${accessToken}`;
}
/**
 * Get the token_endpoint from the .well-known/smart-configuration
 *
 * @param {string} url - the fhir base url
 * @returns token_endpoint
 */
async function getTokenEndpoint(url) {
  // Attempt checking at the `.well-known/smart-configuration`
  const response = await axios.get(`${url}/.well-known/smart-configuration`);
  return response.data.token_endpoint;
}
async function getAccessToken(url, jwt, customScopes) {
  const props = {
    scope: customScopes ?? 'system/*.rs',
    grant_type: 'client_credentials',
    client_assertion_type: 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer',
    client_assertion: jwt
  };
  const headers = {
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    }
  };
  const response = await axios.post(url, new URLSearchParams(props), headers);
  if (typeof response.data.access_token !== 'string' || !response.data.access_token) {
    throw new Error(`Token endpoint ${url} did not return an access_token.`);
  }
  if (typeof response.data.expires_in !== 'number' || response.data.expires_in <= 0) {
    throw new Error(`Token endpoint ${url} did not return a valid expires_in value.`);
  }
  return response.data;
}

function getSigningAlgorithm(key) {
  // PEM files do not carry an algorithm;
  // fallback to a SMART baseline algorithm based on the key type.
  const defaults = { RSA: 'RS384', EC: 'ES384' };
  const algorithm = key.alg || defaults[key.kty];

  if (!SUPPORTED_ALGORITHMS.includes(algorithm) || !key.algorithms('sign').includes(algorithm)) {
    throw new Error('Private key does not support RS384 or ES384 signing');
  }

  return algorithm;
}

/**
 * Generate a signed JWT used for authenticating
 */
async function generateJWT(client_id, aud) {
  const key = await getPrivateKey();
  const payload = {
    sub: client_id,
    iss: client_id,
    aud: aud,
    exp: Math.floor(Date.now() / 1000) + 240,
    jti: v4()
  };
  return jose.JWS.createSign(
    {
      format: 'compact',
      fields: { alg: getSigningAlgorithm(key), kid: key.kid, typ: 'JWT' }
    },
    key
  )
    .update(JSON.stringify(payload))
    .final();
}
async function getPrivateKey() {
  // set JWT_PRIVATE_KEY_FILE to the path to the private-key.pem in the .env file
  if (!privateKeyFile) {
    throw new Error('JWT_PRIVATE_KEY_FILE is not configured');
  } else if (!existsSync(privateKeyFile)) {
    throw new Error('JWT_PRIVATE_KEY_FILE is configured but file does not exist');
  }
  const keyFileText = await fs.readFile(privateKeyFile, 'utf8');
  if (keyFileText.trimStart().startsWith('{')) {
    // Expected format: a JWKS object ({ "keys": [...] }) containing a private key with:
    // - alg: "RS384" or "ES384"
    // - key_ops: ["sign"] (required by this loader for now, note this is optional in JWK spec)
    // - the private key material needed for signing
    const keys = JSON.parse(keyFileText);
    const keyAsJson = keys.keys.find(k => SUPPORTED_ALGORITHMS.includes(k['alg']) && k['key_ops']?.includes('sign'));
    if (!keyAsJson) {
      throw new Error(
        'No supported signing key found in JWT_PRIVATE_KEY_FILE. Expected a private signing key with "alg" RS384 or ES384 and "key_ops" containing "sign"'
      );
    }
    return await jose.JWK.asKey(keyAsJson);
  }
  if (keyFileText.trimStart().startsWith('-')) {
    // it's a PEM
    return await jose.JWK.asKey(keyFileText, 'pem');
  }
  throw new Error('Unsupported file format for JWT_PRIVATE_KEY_FILE');
}
module.exports = TokenManager;
