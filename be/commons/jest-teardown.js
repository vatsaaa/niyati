module.exports = async () => {
  try {
    const { shutdownAll } = require('./lib/shutdown');
    // Allow shorter wait during tests
    await shutdownAll(5000);
  } catch (err) {
    // Keep teardown noise non-fatal
    // eslint-disable-next-line no-console
    console.error('Jest global teardown error:', err && (err.stack || err.message || err));
  }
};
