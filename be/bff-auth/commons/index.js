// Local shim to re-export repository `be/commons` for tests and runtime
const path = require('path');
try {
	// Prefer the repository-level commons when running from the repo root or container (/app)
	module.exports = require(path.join(process.cwd(), 'commons'));
} catch (e) {
	// Fallback to the original relative path for older dev layouts
	module.exports = require('../../commons');
}
