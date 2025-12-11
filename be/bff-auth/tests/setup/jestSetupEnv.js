const fs = require('fs');
const os = require('os');
const path = require('path');

// Read the temp file written by globalSetup and export DATABASE_URL into process.env
const tmpPath = path.join(os.tmpdir(), 'niyati_test_db.json');
if (fs.existsSync(tmpPath)) {
  try {
    const state = JSON.parse(fs.readFileSync(tmpPath, 'utf8'));
    if (state && state.databaseUrl) {
      process.env.DATABASE_URL = state.databaseUrl;
      console.log('jest setup: DATABASE_URL set from global setup');
    }
  } catch (err) {
    console.warn('jest setup: failed to read test DB state', err && err.message);
  }
}
