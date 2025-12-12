const commons = require('../../be/commons');

// Minimal re-export so legacy tools/scripts can require '../src/lib/logger'
module.exports = {
  logger: commons.logger || console,
  sanitize: commons.sanitize || ((v) => v)
};
