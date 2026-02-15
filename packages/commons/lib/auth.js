// Re-export from @niyati/auth-core JWT factory, wired with niyati defaults.
const { createJwtProvider } = require('@niyati/auth-core/lib/jwt');

// Create a provider bound to niyati's env vars and claim values.
// The factory makes issuer/audience/secret configurable; here we
// wire the niyati-specific defaults so existing consumers see
// identical behaviour.
function getProvider() {
  return createJwtProvider({
    secret: process.env.ACCESS_TOKEN_SECRET,
    issuer: 'niyati-bff',
    audience: 'niyati-app',
    algorithm: 'HS256',
    expiresIn: process.env.ACCESS_TOKEN_EXPIRES || '15m'
  });
}

function validateAuthConfig() {
  return getProvider().validateAuthConfig();
}

function createAccessToken(payload, opts = {}) {
  return getProvider().createAccessToken(payload, opts);
}

function verifyAccessToken(token) {
  return getProvider().verifyAccessToken(token);
}

module.exports = {
  validateAuthConfig,
  createAccessToken,
  verifyAccessToken
};
