const { auth: commonAuth, ErrorCodes } = require('@niyati/commons');
const { validateAuthConfig, verifyAccessToken } = commonAuth;
function RC(codeName) { return ErrorCodes[codeName] || codeName; }

// Call on module load
if (require.main !== module) {
  validateAuthConfig();
}

function authenticate(req, res, next) {
  const auth = req.headers.authorization || '';
  let token;
  if (auth.startsWith('Bearer ')) token = auth.slice(7);
  if (!token) return res.sendError(RC('UNAUTHORIZED'), 'Authentication required');

  const secret = process.env.ACCESS_TOKEN_SECRET;
  if (!secret) {
    console.error('ACCESS_TOKEN_SECRET not configured');
    return res.sendError(RC('INTERNAL_SERVER_ERROR'), 'Server configuration error');
  }

  try {
    const payload = verifyAccessToken(token);

    // Validate required claims
    if (!payload.sub) {
      return res.sendError(RC('UNAUTHORIZED'), 'Invalid token claims');
    }

    req.user = { id: payload.sub, ...payload };
    return next();
  } catch (err) {
    // Log specific error types for debugging without exposing to client
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

module.exports = { authenticate, requireRole, validateAuthConfig };
