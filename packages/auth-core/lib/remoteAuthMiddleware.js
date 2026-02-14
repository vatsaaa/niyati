/**
 * Remote auth middleware factory — validates Bearer tokens by calling a
 * remote /auth/validate endpoint and caches results.
 *
 * Usage:
 *   const { createRemoteAuthMiddleware } = require('@niyati/auth-core/lib/remoteAuthMiddleware');
 *
 *   const authenticateOrReject = createRemoteAuthMiddleware({
 *     validateUrl: 'http://auth-service:3001/auth/validate',
 *     serviceToken: process.env.SERVICE_TOKEN,  // optional, for X-Service-Token bypass
 *     logger: pinoLogger,                       // optional, defaults to console
 *     errorCodes: { UNAUTHORIZED, INTERNAL_SERVER_ERROR },
 *     cacheTtl: 30,                             // optional, seconds, default 30
 *     timeout: 3000                             // optional, ms, default 3000
 *   });
 */

const axios = require('axios');
const NodeCache = require('node-cache');

const defaultLogger = {
  info: () => {},
  warn: (...args) => console.warn('[auth-core:remote]', ...args),
  error: (...args) => console.error('[auth-core:remote]', ...args)
};

function createRemoteAuthMiddleware(config = {}) {
  const {
    validateUrl,
    serviceToken,
    logger = defaultLogger,
    errorCodes = {},
    cacheTtl = 30,
    timeout = 3000
  } = config;

  const RC = (code) => errorCodes[code] || code;

  // Disable checkperiod (0) so NodeCache does not keep the Node process alive in tests
  const cache = new NodeCache({ stdTTL: cacheTtl, checkperiod: 0 });

  async function validateRemoteToken(token) {
    if (!token) return null;

    const cached = cache.get(token);
    if (cached) return cached;

    if (!validateUrl) {
      logger.warn({ msg: 'auth.validate_no_url_configured' });
      return null;
    }

    try {
      const resp = await axios.post(validateUrl, {}, {
        headers: { Authorization: `Bearer ${token}` },
        timeout
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

  async function authenticateOrReject(req, res, next) {
    try {
      // Allow internal service token (used for background jobs / trusted services)
      const svcToken = serviceToken || '';
      const incoming = req.headers['x-service-token'] || '';
      if (svcToken && svcToken.length > 0 && incoming && incoming === svcToken) {
        req.user = { service: 'internal' };
        return next();
      }

      const auth = (req.headers && (req.headers.authorization || req.headers.Authorization)) || '';
      let token = '';
      if (typeof auth === 'string' && auth.startsWith('Bearer ')) token = auth.slice(7).trim();

      if (!token) {
        return res.sendError(RC('UNAUTHORIZED'), 'authentication_required');
      }

      const user = await validateRemoteToken(token);
      if (!user) return res.sendError(RC('UNAUTHORIZED'), 'invalid_access_token');

      req.user = user;
      return next();
    } catch (err) {
      logger.error({ msg: 'auth.middleware_error', err: err && err.stack ? err.stack : err });
      return res.sendError(RC('INTERNAL_SERVER_ERROR'), 'auth_middleware_failed');
    }
  }

  return authenticateOrReject;
}

module.exports = { createRemoteAuthMiddleware };
