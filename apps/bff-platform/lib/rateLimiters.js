/**
 * Platform-specific rate limiters for bff-platform routes.
 *
 * Rate limits per the interaction script:
 * - /chat (send):        10 requests per 1 minute
 * - /payments/submit:     5 requests per 10 minutes
 * - /users/identify:      3 requests per 5 minutes
 * - General API:         60 requests per 1 minute (safety net)
 */

const rateLimit = require('express-rate-limit');

const errorResponse = (msg) => ({
  status: 'error',
  error: { code: 'RATE_LIMIT_EXCEEDED', message: msg }
});

const chatLimiter = rateLimit({
  windowMs: 60 * 1000,  // 1 minute
  max: 10,
  message: errorResponse('Too many chat requests, please slow down'),
  standardHeaders: true,
  legacyHeaders: false
});

const paymentSubmitLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,  // 10 minutes
  max: 5,
  message: errorResponse('Too many payment submissions, please try again later'),
  standardHeaders: true,
  legacyHeaders: false
});

const identifyLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,  // 5 minutes
  max: 3,
  message: errorResponse('Too many login attempts, please try again later'),
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    const phone = req.body?.phoneNumber || 'unknown';
    return `${req.ip}:${phone}`;
  }
});

const generalLimiter = rateLimit({
  windowMs: 60 * 1000,  // 1 minute
  max: 60,
  message: errorResponse('Too many requests, please slow down'),
  standardHeaders: true,
  legacyHeaders: false
});

module.exports = {
  chatLimiter,
  paymentSubmitLimiter,
  identifyLimiter,
  generalLimiter
};
