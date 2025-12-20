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
// Determine pretty print: env overrides config
let prettyPrint;
if (process.env.LOG_PRETTY_PRINT !== undefined) {
  prettyPrint = String(process.env.LOG_PRETTY_PRINT).toLowerCase() === 'true';
} else if (config && config.logging && typeof config.logging.prettyPrint !== 'undefined') {
  prettyPrint = !!config.logging.prettyPrint;
} else {
  prettyPrint = false;
}

// Configure logger based on environment
const loggerOptions = {
  level,
  redact: { 
    paths: [
      'password',
      'token',
      'apiKey',
      'api_key',
      'accessToken',
      'access_token',
      'refreshToken',
      'refresh_token',
      'secret',
      'privateKey',
      'private_key',
      'req.headers.authorization',
      'req.headers["x-api-key"]',
      'authorization'
    ], 
    censor: '***REDACTED***',
    remove: true // Remove instead of replacing with censor string
  },
  base: { pid: process.pid },
  // Prevent circular references from causing crashes
  serializers: {
    err: pino.stdSerializers.err,
    req: pino.stdSerializers.req,
    res: pino.stdSerializers.res
  }
};

// Add pretty printing when explicitly enabled and pino-pretty is available
if (prettyPrint) {
  try {
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
    // If pino-pretty not available, fall back to regular logging but warn
    // only in non-test environments to avoid noisy test output
    if (process.env.NODE_ENV !== 'test') console.warn('pino-pretty not available, using standard logging');
  }
}

const logger = pino(loggerOptions);

/**
 * Extracts request ID from Express request object.
 * Checks both 'x-request-id' and 'x-correlation-id' headers.
 *
 * @param {import('express').Request} req - Express request object
 * @returns {string|undefined} Request ID if found, undefined otherwise
 */
function reqIdFromReq(req) {
  if (!req || typeof req !== 'object') return undefined;
  if (!req.headers || typeof req.headers !== 'object') return undefined;
  
  const requestId = req.headers['x-request-id'] || req.headers['x-correlation-id'];
  
  // Validate format - should be a reasonable UUID or similar
  if (requestId && typeof requestId === 'string' && requestId.length > 0 && requestId.length < 100) {
    return requestId;
  }
  
  return undefined;
}

module.exports = {
  logger,
  sanitize,
  reqIdFromReq
};
