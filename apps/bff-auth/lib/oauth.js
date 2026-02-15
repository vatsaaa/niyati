// Re-export from @niyati/auth-core for backward compatibility
const { generateCodeVerifier, generateCodeChallenge, generateState, getProviderConfig } = require('@niyati/auth-core/lib/oauth');

module.exports = { generateCodeVerifier, generateCodeChallenge, generateState, getProviderConfig };
