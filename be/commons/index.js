// be/commons/index.js
// Re-export shared utilities to be used by both BFF services

const { logger, reqLogger, formatError, hashForLogs } = require('./lib/logger');
const { ErrorCodes, attachResponseHelpers, sendSuccess, sendError } = require('./lib/responses');
const { sanitize, sanitizeEmail, sanitizeName } = require('./lib/sanitize');
const { createRateLimiter } = require('./lib/rateLimiter');
const constants = require('./lib/constants');

// Re-export config for services to use
const config = require('./config');

module.exports = {
  logger,
  reqLogger,
  formatError,
  hashForLogs,
  ErrorCodes,
  attachResponseHelpers,
  sendSuccess,
  sendError,
  sanitize,
  sanitizeEmail,
  sanitizeName,
  createRateLimiter,
  constants,
  config
};

