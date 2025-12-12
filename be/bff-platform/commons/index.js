// Local shim to re-export repository `be/commons` for tests and runtime
module.exports = require('../../commons');
// Local re-export of repository `be/commons` so relative requires resolve inside this package
module.exports = require('../commons');
