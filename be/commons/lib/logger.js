const pino = require('pino');
const crypto = require('crypto');
const { sanitize } = require('./sanitize');

// Load config after it's been initialized (lazy load to avoid circular dependency)
let config;
try {
  config = require('../config');
} catch (e) {
  // Fallback if config not available (should not happen in normal operation)
  config = { logging: { level: 'info', prettyPrint: false } };
}

const level = config.logging.level;
// Disable pretty printing in Docker - pino-pretty has module resolution issues
const prettyPrint = false;

// Configure logger based on environment
const loggerOptions = {
  level,
  redact: { paths: [], censor: '***REDACTED***' },
  base: { pid: process.pid }
};

// Add pretty printing for development
if (prettyPrint) {
  try {
    // Use require.resolve to ensure pino-pretty is found
    require.resolve('pino-pretty');
    loggerOptions.transport = {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'SYS:standard',
        ignore: 'pid,hostname'
      }
    };
  } catch (e) {
    // If pino-pretty not available, fall back to regular logging
    console.warn('pino-pretty not available, using standard logging');
  }
}

const logger = pino(loggerOptions);

/**
 * Extracts request ID from Express request object.
 * Checks both 'x-request-id' and 'x-correlation-id' headers.
 * 
 * @param {Object} req - Express request object
 * @returns {string|undefined} Request ID if found, undefined otherwise
 */
function reqIdFromReq(req) {
  if (!req) return undefined;
  return req.headers && (req.headers['x-request-id'] || req.headers['x-correlation-id']);
}

module.exports = {
  logger,
  sanitize,
  reqIdFromReq
};
