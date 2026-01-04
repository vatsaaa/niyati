/**
 * Simple in-memory rate limiter for auth endpoints
 * For production, use Redis-backed rate limiting
 *
 * @module be/commons/lib/rateLimiter
 */

const rateLimit = require('express-rate-limit');

// Rate limiter for login attempts (prevent brute force)
/**
 * Express rate limiter instance used for login attempts.
 * @type {import('express-rate-limit').RateLimit}
 */
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 attempts per window
  message: { status: 'error', error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Too many login attempts, please try again later' } },
  standardHeaders: true,
  legacyHeaders: false,
  // Use IP + email combination for more granular limiting
  keyGenerator: (req) => {
    const email = req.body?.email || 'unknown';
    return `${req.ip}:${email}`;
  }
});

// Rate limiter for registration (prevent account creation spam)
/**
 * @type {import('express-rate-limit').RateLimit}
 */
const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3, // 3 registrations per hour per IP
  message: { status: 'error', error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Too many registration attempts, please try again later' } },
  standardHeaders: true,
  legacyHeaders: false
});

// Rate limiter for password reset requests (prevent email enumeration and spam)
/**
 * @type {import('express-rate-limit').RateLimit}
 */
const passwordResetLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3, // 3 reset requests per hour per IP
  message: { status: 'error', error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Too many password reset requests, please try again later' } },
  standardHeaders: true,
  legacyHeaders: false
});

// Rate limiter for token refresh (prevent token abuse)
/**
 * @type {import('express-rate-limit').RateLimit}
 */
const tokenRefreshLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 10, // 10 refresh attempts per minute
  message: { status: 'error', error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Too many token refresh requests, please slow down' } },
  standardHeaders: true,
  legacyHeaders: false
});

/**
 * @typedef {Object} RateLimiters
 * @property {import('express-rate-limit').RateLimit} loginLimiter
 * @property {import('express-rate-limit').RateLimit} registerLimiter
 * @property {import('express-rate-limit').RateLimit} passwordResetLimiter
 * @property {import('express-rate-limit').RateLimit} tokenRefreshLimiter
 */

/** @type {RateLimiters} */
module.exports = {
  loginLimiter,
  registerLimiter,
  passwordResetLimiter,
  tokenRefreshLimiter
};
