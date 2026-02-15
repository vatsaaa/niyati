/**
 * JWT provider factory — configurable issuer, audience, secret, algorithm.
 *
 * Usage:
 *   const { createJwtProvider } = require('@niyati/auth-core/lib/jwt');
 *   const provider = createJwtProvider({
 *     secret: process.env.ACCESS_TOKEN_SECRET,
 *     issuer: 'my-service',
 *     audience: 'my-frontend',
 *     algorithm: 'HS256',      // optional, default HS256
 *     expiresIn: '15m'         // optional, default 15m
 *   });
 *
 *   const token = provider.createAccessToken({ sub: userId });
 *   const payload = provider.verifyAccessToken(token);
 */

const jwt = require('jsonwebtoken');

function createJwtProvider(config = {}) {
  const {
    secret,
    issuer,
    audience,
    algorithm = 'HS256',
    expiresIn: defaultExpiresIn = '15m'
  } = config;

  /**
   * Validate that the secret is configured. In production throws; otherwise warns.
   */
  function validateAuthConfig() {
    if (!secret) {
      if (process.env.NODE_ENV === 'production') {
        throw new Error('Missing required auth config: secret not configured');
      } else {
        console.warn('WARNING: Missing required auth config — secret not configured');
      }
    }
  }

  /**
   * Sign a JWT with the configured secret, issuer, audience and algorithm.
   * @param {object} payload — claims (must include `sub`)
   * @param {object} opts — optional overrides ({ expiresIn })
   * @returns {string} signed JWT
   */
  function createAccessToken(payload, opts = {}) {
    if (!secret) {
      throw new Error('secret not configured');
    }

    const signOpts = {
      expiresIn: opts.expiresIn || defaultExpiresIn,
      algorithm
    };

    if (issuer) signOpts.issuer = issuer;
    if (audience) signOpts.audience = audience;

    return jwt.sign(payload, secret, signOpts);
  }

  /**
   * Verify and decode a JWT.
   * @param {string} token
   * @returns {object} decoded payload
   */
  function verifyAccessToken(token) {
    if (!secret) {
      throw new Error('secret not configured');
    }

    const verifyOpts = { algorithms: [algorithm] };
    // Only enforce issuer/audience if they were configured
    if (issuer) verifyOpts.issuer = issuer;
    if (audience) verifyOpts.audience = audience;

    return jwt.verify(token, secret, verifyOpts);
  }

  return { createAccessToken, verifyAccessToken, validateAuthConfig };
}

module.exports = { createJwtProvider };
