// Playwright config for simple API-level e2e tests
// Use BASE_URL env var to point to running instance (default http://127.0.0.1)
const { devices } = require('@playwright/test');

module.exports = {
  timeout: 30000,
  use: {
    baseURL: process.env.BASE_URL || 'http://127.0.0.1:6173',
    actionTimeout: 15000,
    trace: 'retain-on-failure',
    // Accept self-signed / internal CA certs used in local/CI infra
    ignoreHTTPSErrors: true,
    // When running in CI/local with a SERVICE_TOKEN set, include it
    // on all browser requests so tests can exercise authenticated BFF routes.
    extraHTTPHeaders: (process.env.SERVICE_TOKEN && process.env.SERVICE_TOKEN.length > 0)
      ? { 'x-service-token': process.env.SERVICE_TOKEN }
      : {}
  },
  projects: [
    { name: 'api', use: {} }
  ]
};
