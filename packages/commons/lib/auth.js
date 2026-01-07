const jwt = require('jsonwebtoken');

/**
 * Validate critical auth environment variables on startup
 */
function validateAuthConfig() {
  const secrets = ['ACCESS_TOKEN_SECRET'];
  const missing = secrets.filter(key => !process.env[key]);
  
  if (missing.length > 0) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error(`Missing required auth config: ${missing.join(', ')}`);
    } else {
      console.warn('WARNING: Missing required auth environment variables:', missing);
    }
  }
}

/**
 * Helper to create access token (JWT)
 */
function createAccessToken(payload, opts = {}) {
  const secret = process.env.ACCESS_TOKEN_SECRET;
  if (!secret) {
    throw new Error('ACCESS_TOKEN_SECRET not configured');
  }

  const expiresIn = opts.expiresIn || process.env.ACCESS_TOKEN_EXPIRES || '15m';

  return jwt.sign(payload, secret, {
    expiresIn,
    algorithm: 'HS256',
    issuer: 'niyati-bff',
    audience: 'niyati-app'
  });
}

/**
 * Verify access token
 */
function verifyAccessToken(token) {
  const secret = process.env.ACCESS_TOKEN_SECRET;
  if (!secret) {
    throw new Error('ACCESS_TOKEN_SECRET not configured');
  }

  return jwt.verify(token, secret, {
    algorithms: ['HS256']
  });
}

module.exports = {
  validateAuthConfig,
  createAccessToken,
  verifyAccessToken
};
