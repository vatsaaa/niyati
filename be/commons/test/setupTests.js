// Jest setup to ensure long-lived resources are shut down after each test
const { shutdownAll } = require('../lib/shutdown');
const { cleanupTest } = require('./helpers');

// After each test try to close any registered resources promptly
afterEach(async () => {
  try {
    // small timeout is intentional to keep tests fast
    await shutdownAll(2000);
  } catch (e) {
    // ignore
  }
  try { cleanupTest(); } catch (e) {}
});
