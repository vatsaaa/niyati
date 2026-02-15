/**
 * Auth middleware factory — generic JWT authenticate + role-based authorization.
 *
 * Usage:
 *   const jwt = require('jsonwebtoken');
 *   const { createAuthMiddleware } = require('@niyati/auth-core');
 *
 *   const { authenticate, requireRole } = createAuthMiddleware({
 *     verifyToken: (token) => jwt.verify(token, process.env.SECRET, { algorithms: ['HS256'] }),
 *     errorCodes: { UNAUTHORIZED: 'UNAUTHORIZED', FORBIDDEN: 'FORBIDDEN' }
 *   });
 *
 *   router.get('/protected', authenticate, handler);
 *   router.get('/admin', authenticate, requireRole('admin'), handler);
 */

function createAuthMiddleware({ verifyToken, errorCodes = {} } = {}) {
  const RC = (code) => errorCodes[code] || code;

  function authenticate(req, res, next) {
    const auth = req.headers.authorization || '';
    let token;
    if (auth.startsWith('Bearer ')) token = auth.slice(7);
    if (!token) return res.sendError(RC('UNAUTHORIZED'), 'Authentication required');

    if (typeof verifyToken !== 'function') {
      console.error('auth-core: verifyToken function not provided');
      return res.sendError(RC('INTERNAL_SERVER_ERROR'), 'Server configuration error');
    }

    try {
      const payload = verifyToken(token);

      // Validate required claims
      if (!payload.sub) {
        return res.sendError(RC('UNAUTHORIZED'), 'Invalid token claims');
      }

      req.user = { id: payload.sub, ...payload };
      return next();
    } catch (err) {
      if (err.name === 'TokenExpiredError') {
        return res.sendError(RC('UNAUTHORIZED'), 'Token expired');
      }
      return res.sendError(RC('UNAUTHORIZED'), 'Invalid access token');
    }
  }

  function requireRole(role) {
    return (req, res, next) => {
      if (!req.user) return res.sendError(RC('UNAUTHORIZED'), 'Missing authentication');
      const roles = req.user.roles || [];
      if (!roles.includes(role)) return res.sendError(RC('FORBIDDEN'), 'Insufficient role');
      return next();
    };
  }

  return { authenticate, requireRole };
}

module.exports = { createAuthMiddleware };
