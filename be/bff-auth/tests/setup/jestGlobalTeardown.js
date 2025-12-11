const fs = require('fs');
const os = require('os');
const path = require('path');
const { execSync } = require('child_process');

module.exports = async () => {
  try {
    const tmpPath = path.join(os.tmpdir(), 'niyati_test_db.json');
    if (!fs.existsSync(tmpPath)) return;
    const state = JSON.parse(fs.readFileSync(tmpPath, 'utf8'));
    // Remove containers started by globalSetup by label (if docker CLI available)
    try {
      // Find containers with label niyati_test=1
      const ids = execSync("docker ps -aq --filter label=niyati_test=1").toString().trim();
      if (ids) {
        execSync(`docker rm -f ${ids}`, { stdio: 'inherit' });
        console.log('Jest global teardown: removed container(s)', ids);
      }
    } catch (err) {
      // Fall back to nothing
    }
    fs.unlinkSync(tmpPath);
  } catch (err) {
    console.warn('Error in globalTeardown:', err && err.message);
  }
};
