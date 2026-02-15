// Re-export from @niyati/auth-core remote middleware factory,
// wired with niyati-specific env vars and logger.
const { createRemoteAuthMiddleware } = require('@niyati/auth-core/lib/remoteAuthMiddleware');
const { logger } = require('./logger');
const { ErrorCodes } = require('./responses');

const authUrl = process.env.BFF_AUTH_URL || process.env.BFF_AUTH_BASE || '';

const authenticateOrReject = createRemoteAuthMiddleware({
  validateUrl: authUrl ? `${authUrl.replace(/\/$/, '')}/api/v1/auth/validate` : '',
  serviceToken: process.env.SERVICE_TOKEN,
  logger,
  errorCodes: ErrorCodes,
  cacheTtl: 30,
  timeout: 3000
});

// Also expose the generic validateRemoteToken for backward compat
async function validateRemoteToken(token) {
  // Reuse the factory's internal validation by simulating a request
  // This is kept for backward-compatible imports but callers should
  // prefer the middleware directly.
  const { createRemoteAuthMiddleware: _factory } = require('@niyati/auth-core/lib/remoteAuthMiddleware');
  // For direct token validation, create a one-off middleware that captures the result
  return new Promise((resolve) => {
    const mw = _factory({
      validateUrl: authUrl ? `${authUrl.replace(/\/$/, '')}/api/v1/auth/validate` : '',
      logger,
      errorCodes: ErrorCodes,
      cacheTtl: 30,
      timeout: 3000
    });
    const fakeReq = { headers: { authorization: `Bearer ${token}` } };
    const fakeRes = { sendError: () => resolve(null) };
    mw(fakeReq, fakeRes, () => resolve(fakeReq.user || null));
  });
}

module.exports = { authenticateOrReject, validateRemoteToken };
