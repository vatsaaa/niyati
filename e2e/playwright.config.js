// Playwright config for simple API-level e2e tests
// Use BASE_URL env var to point to running instance (default http://127.0.0.1)
const { devices } = require('@playwright/test');

module.exports = {
  timeout: 30000,
  use: {
    baseURL: process.env.BASE_URL || 'http://127.0.0.1',
    actionTimeout: 10000,
    trace: 'retain-on-failure'
  },
  projects: [
    { name: 'api', use: {} }
  ]
};
