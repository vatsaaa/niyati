// Re-export from @niyati/auth-core factory, wired with niyati's JWT verifier and error codes.
const { createAuthMiddleware } = require('@niyati/auth-core/lib/authMiddleware');
const { auth: commonAuth, ErrorCodes } = require('@niyati/commons');
const { validateAuthConfig, verifyAccessToken } = commonAuth;

// Call on module load
if (require.main !== module) {
  validateAuthConfig();
}

const { authenticate, requireRole } = createAuthMiddleware({
  verifyToken: verifyAccessToken,
  errorCodes: ErrorCodes
});

module.exports = { authenticate, requireRole, validateAuthConfig };
