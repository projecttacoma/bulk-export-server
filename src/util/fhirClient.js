const axios = require('axios');
const TokenManager = require('./tokenManager');
// SMART-aware client for outgoing FHIR interactions.
// See original at https://github.com/projecttacoma/deqm-test-server/blob/main/src/util/fhirClient.ts
class FHIRClient {
  baseUrl;
  http;
  logger;
  constructor(baseUrl, logger = console) {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.http = axios.create({
      baseURL: this.baseUrl,
      headers: {
        Accept: 'application/fhir+json'
      }
    });
    this.logger = logger;
  }
  async get(path, config = {}) {
    return this.request({ ...config, method: 'GET', url: path });
  }
  async post(path, body, config = {}) {
    return this.request({
      ...config,
      method: 'POST',
      url: path,
      data: body,
      headers: {
        'Content-Type': 'application/fhir+json',
        ...config.headers
      }
    });
  }
  async request(config, retried = false) {
    const token = await TokenManager.getToken(this.baseUrl);
    try {
      const headers = { ...config.headers };
      if (token) {
        headers['Authorization'] = token.bearerToken;
      }
      this.logger.debug(`External FHIR Request: ${config.method} ${config.url}`);
      const response = await this.http.request({
        ...config,
        headers
      });
      // Preserve the HTTP status and headers for submission callers.
      return response;
    } catch (error) {
      if (!retried && axios.isAxiosError(error) && error.response?.status === 401) {
        // try again once if we got an error 401, maybe the token just expired
        TokenManager.invalidate(this.baseUrl, token?.bearerToken);
        return this.request(config, true);
      }
      this.logger.error(`Error with External FHIR Request`, error);
      if (axios.isAxiosError(error)) {
        throw new Error(
          `Error with External FHIR Request to ${config.method} ${config.url}: ${error} \n${JSON.stringify(
            error.response?.data
          )}`,
          {
            cause: error
          }
        );
      } else {
        throw new Error(`Error with External FHIR Request to ${config.method} ${config.url}: ${error}`, {
          cause: error
        });
      }
    }
  }
}
module.exports = FHIRClient;
