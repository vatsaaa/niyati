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
const createTelemetryRouter = require('./lib/telemetry');
const { validateEnv, validateChecks, validateOrExit } = require('./lib/validateEnv');
const { authenticateOrReject } = require('./lib/authMiddleware');
const { registerShutdown, unregisterShutdown, shutdownAll } = require('./lib/shutdown');
const auth = require('./lib/auth');
const utils = require('./lib/utils');
const dateUtils = require('./lib/dateUtils');

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
  createTelemetryRouter,
  validateEnv,
  validateChecks,
  validateOrExit,
  authenticateOrReject,
  registerShutdown,
  unregisterShutdown,
  shutdownAll,
  config,
  auth,
  utils,
  dateUtils
};

