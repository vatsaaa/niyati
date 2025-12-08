const jwt = require('jsonwebtoken');
const { config, ErrorCodes } = require('../commons');

// Validate critical auth environment variables on startup
function validateAuthConfig() {
  const required = ['ACCESS_TOKEN_SECRET'];
  const missing = required.filter(key => !process.env[key]);
  
  if (missing.length > 0) {
    console.error('CRITICAL: Missing required auth environment variables:', missing);
    if (process.env.NODE_ENV === 'production') {
      throw new Error(`Missing required auth config: ${missing.join(', ')}`);
    }
  }
  
  // Warn about weak secrets in production
  if (process.env.NODE_ENV === 'production') {
    const secret = process.env.ACCESS_TOKEN_SECRET;
    if (secret && secret.length < 32) {
      console.warn('WARNING: ACCESS_TOKEN_SECRET should be at least 32 characters in production');
    }
  }
}

// Call on module load
if (require.main !== module) {
  validateAuthConfig();
}

function authenticate(req, res, next) {
  const auth = req.headers.authorization || '';
  let token;
  if (auth.startsWith('Bearer ')) token = auth.slice(7);
  if (!token) return res.sendError(ErrorCodes.UNAUTHORIZED, 'Authentication required');

  const secret = process.env.ACCESS_TOKEN_SECRET;
  if (!secret) {
    console.error('ACCESS_TOKEN_SECRET not configured');
    return res.sendError(ErrorCodes.INTERNAL_SERVER_ERROR, 'Server configuration error');
  }

  try {
    const payload = jwt.verify(token, secret, {
      algorithms: ['HS256'], // Explicitly specify allowed algorithms
      maxAge: '1h' // Additional safeguard against very old tokens
    });
    
    // Validate required claims
    if (!payload.sub) {
      return res.sendError(ErrorCodes.UNAUTHORIZED, 'Invalid token claims');
    }
    
    req.user = { id: payload.sub, ...payload };
    return next();
  } catch (err) {
    // Log specific error types for debugging without exposing to client
    if (err.name === 'TokenExpiredError') {
      return res.sendError(ErrorCodes.UNAUTHORIZED, 'Token expired');
    }
    return res.sendError(ErrorCodes.UNAUTHORIZED, 'Invalid access token');
  }
}

function requireRole(role) {
  return (req, res, next) => {
    if (!req.user) return res.sendError(ErrorCodes.UNAUTHORIZED, 'Missing authentication');
    const roles = req.user.roles || [];
    if (!roles.includes(role)) return res.sendError(ErrorCodes.FORBIDDEN, 'Insufficient role');
    return next();
  };
}

module.exports = { authenticate, requireRole, validateAuthConfig };
