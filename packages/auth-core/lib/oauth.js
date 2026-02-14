const crypto = require('crypto');

// Simple PKCE helpers
function generateCodeVerifier(length = 64) {
  return crypto.randomBytes(Math.ceil(length * 0.75)).toString('base64url').slice(0, length);
}

function generateCodeChallenge(verifier) {
  return crypto.createHash('sha256').update(verifier).digest('base64url');
}

function generateState() {
  return crypto.randomBytes(16).toString('hex');
}

// Provider configuration loader — reads env vars like OAUTH_GOOGLE_CLIENT_ID, etc.
function getProviderConfig(name) {
  const upper = name.toUpperCase();
  return {
    clientId: process.env[`OAUTH_${upper}_CLIENT_ID`] || null,
    clientSecret: process.env[`OAUTH_${upper}_CLIENT_SECRET`] || null,
    authorizeUrl: process.env[`OAUTH_${upper}_AUTHORIZE_URL`] || null,
    tokenUrl: process.env[`OAUTH_${upper}_TOKEN_URL`] || null,
    userInfoUrl: process.env[`OAUTH_${upper}_USERINFO_URL`] || null,
    scopes: (process.env[`OAUTH_${upper}_SCOPES`] || 'openid profile email').split(' ')
  };
}

module.exports = { generateCodeVerifier, generateCodeChallenge, generateState, getProviderConfig };
