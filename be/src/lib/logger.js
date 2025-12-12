const commons = require('../../commons');

module.exports = {
  logger: commons.logger || console,
  sanitize: commons.sanitize || ((v) => v)
};
