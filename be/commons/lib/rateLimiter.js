/**
 * Rate limiter factory and helpers
 * - Exposes `createRateLimiter(config)` which returns named limiters
 * - Also provides default pre-created limiters for backward compatibility
 *
 * Notes:
 * - In production you should supply a shared store (Redis) via config
 *   so rate limits are consistent across instances.
 */

const rateLimit = require('express-rate-limit');

const defaultConfig = require('../config').rateLimit || {};

function makeLimiter(opts = {}) {
  return rateLimit({
    windowMs: opts.windowMs,
    max: opts.max,
    message: opts.message,
    standardHeaders: opts.standardHeaders !== false,
    legacyHeaders: opts.legacyHeaders === true,
    keyGenerator: opts.keyGenerator
  });
}

function createRateLimiter(cfg = {}) {
  const cfgRoot = cfg || defaultConfig;

  const general = cfgRoot.general || {};
  const strict = cfgRoot.strict || {};

  const login = makeLimiter({
    windowMs: general.windowMs || 15 * 60 * 1000,
    max: general.loginMax || 5,
    message: { status: 'error', error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Too many login attempts, please try again later' } },
    keyGenerator: (req) => {
      const email = req.body?.email || 'unknown';
      return `${req.ip}:${email}`;
    }
  });

  const register = makeLimiter({
    windowMs: general.windowMs || 60 * 60 * 1000,
    max: general.registerMax || 3,
    message: { status: 'error', error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Too many registration attempts, please try again later' } }
  });

  const passwordReset = makeLimiter({
    windowMs: general.passwordResetWindowMs || 60 * 60 * 1000,
    max: general.passwordResetMax || 3,
    message: { status: 'error', error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Too many password reset requests, please try again later' } }
  });

  const tokenRefresh = makeLimiter({
    windowMs: strict.windowMs || 1 * 60 * 1000,
    max: strict.tokenRefreshMax || 10,
    message: { status: 'error', error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Too many token refresh requests, please slow down' } }
  });

  return {
    loginLimiter: login,
    registerLimiter: register,
    passwordResetLimiter: passwordReset,
    tokenRefreshLimiter: tokenRefresh
  };
}

// Backward compatible default instance
const DEFAULT_LIMITERS = createRateLimiter(defaultConfig);

module.exports = Object.assign({ createRateLimiter }, DEFAULT_LIMITERS);
