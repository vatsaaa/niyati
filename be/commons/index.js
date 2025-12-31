// be/commons/index.js
// Re-export shared utilities to be used by both BFF services

/**
 * @module be/commons
 *
 * Exports central utilities used across services:
 * - `logger`: structured logger
 * - `sanitize`: sanitization helper
 * - `attachResponseHelpers`: middleware that adds `res.sendError`/`res.sendSuccess`
 * - `ErrorCodes`: canonical error codes
 * - `config`: configuration accessor
 */

const { logger, reqIdFromReq } = require('./lib/logger');
const { ErrorCodes, attachResponseHelpers, sendSuccess, sendError } = require('./lib/responses');
const { sanitize, sanitizeEmail, sanitizeName } = require('./lib/sanitize');
const { createRateLimiter } = require('./lib/rateLimiter');

// Re-export config for services to use
const config = require('./config');

module.exports = {
  logger,
  reqIdFromReq,
  ErrorCodes,
  attachResponseHelpers,
  sendSuccess,
  sendError,
  sanitize,
  sanitizeEmail,
  sanitizeName,
  createRateLimiter,
  config
};

