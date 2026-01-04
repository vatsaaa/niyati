const axios = require('axios');
const NodeCache = require('node-cache');
const { logger } = require('./logger');
const { ErrorCodes } = require('./responses');

// Cache validated tokens for short TTL to avoid repeated remote calls
// Disable checkperiod (0) so NodeCache does not create a background
// interval which can keep the Node process alive during tests.
const cache = new NodeCache({ stdTTL: 30, checkperiod: 0 });

/**
 * Validate access token by calling bff-auth /api/v1/auth/validate
 * Expects BFF_AUTH_URL environment variable to point at bff-auth (e.g. http://bff-auth:3001)
 */
async function validateRemoteToken(token) {
  if (!token) return null;
  const cached = cache.get(token);
  if (cached) return cached;

  const authUrl = process.env.BFF_AUTH_URL || process.env.BFF_AUTH_BASE || '';
  if (!authUrl) {
    logger.warn({ msg: 'auth.validate_no_bff_auth_url' });
    return null;
  }

  try {
    const resp = await axios.post(`${authUrl.replace(/\/$/, '')}/api/v1/auth/validate`, {}, {
      headers: { Authorization: `Bearer ${token}` },
      timeout: 3000
    });
    if (resp && resp.data && resp.data.status === 'ok' && resp.data.data && resp.data.data.user) {
      cache.set(token, resp.data.data.user);
      return resp.data.data.user;
    }
    return null;
  } catch (err) {
    logger.warn({ msg: 'auth.validate_remote_failed', err: err && err.message });
    return null;
  }
}

/**
 * Express middleware to validate incoming requests.
 * Checks Authorization: Bearer <token> via bff-auth validate endpoint.
 * Allows trusted internal callers via X-Service-Token (SERVICE_TOKEN env variable).
 */
async function authenticateOrReject(req, res, next) {
  try {
    // Allow internal service token (used for background jobs / trusted services)
    const svcToken = process.env.SERVICE_TOKEN || '';
    const incoming = req.headers['x-service-token'] || '';
    if (svcToken && svcToken.length > 0 && incoming && incoming === svcToken) {
      req.user = { service: 'internal' };
      return next();
    }

    const auth = (req.headers && (req.headers.authorization || req.headers.Authorization)) || '';
    let token = '';
    if (typeof auth === 'string' && auth.startsWith('Bearer ')) token = auth.slice(7).trim();

    if (!token) {
      return res.sendError(ErrorCodes.UNAUTHORIZED, 'authentication_required');
    }

    const user = await validateRemoteToken(token);
    if (!user) return res.sendError(ErrorCodes.UNAUTHORIZED, 'invalid_access_token');

    // Attach user to request for downstream handlers
    req.user = user;
    return next();
  } catch (err) {
    logger.error({ msg: 'auth.middleware_error', err: err && err.stack ? err.stack : err });
    return res.sendError(ErrorCodes.INTERNAL_SERVER_ERROR, 'auth_middleware_failed');
  }
}

module.exports = { authenticateOrReject, validateRemoteToken };
