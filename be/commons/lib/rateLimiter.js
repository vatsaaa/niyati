/**
 * Simple in-memory rate limiter for auth endpoints
 * For production, use Redis-backed rate limiting
 */

const rateLimit = require('express-rate-limit');

// Rate limiter for login attempts (prevent brute force)
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
const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3, // 3 registrations per hour per IP
  message: { status: 'error', error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Too many registration attempts, please try again later' } },
  standardHeaders: true,
  legacyHeaders: false
});

// Rate limiter for password reset requests (prevent email enumeration and spam)
const passwordResetLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3, // 3 reset requests per hour per IP
  message: { status: 'error', error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Too many password reset requests, please try again later' } },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true // Only count failed attempts
});

// Rate limiter for token refresh (prevent token abuse)
const tokenRefreshLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 10, // 10 refresh attempts per minute
  message: { status: 'error', error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Too many token refresh requests, please slow down' } },
  standardHeaders: true,
  legacyHeaders: false
});

module.exports = {
  loginLimiter,
  registerLimiter,
  passwordResetLimiter,
  tokenRefreshLimiter
};
