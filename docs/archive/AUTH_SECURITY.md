# Authentication Security Guide

## Overview

This document outlines the security measures implemented in the Niyati BFF authentication system and best practices for deployment.

## Security Features Implemented

### 1. Token Management

#### Refresh Token Rotation
- **Implementation**: Every token refresh operation creates a new token and revokes the old one
- **Benefits**: Limits the window of opportunity for token theft
- **Location**: `src/lib/refreshTokens.js`, `src/routes/auth.js`

#### Token Reuse Detection
- **Implementation**: Tracks `last_used_at` timestamp on refresh tokens
- **Detection**: If a revoked token is presented, all user tokens are revoked (potential breach)
- **Rapid reuse**: Tokens used within 1 second trigger security revocation
- **Location**: `src/routes/auth.js` POST `/auth/token`

#### Token Storage
- **Method**: SHA-256 hashed tokens stored in database
- **Raw tokens**: Never stored, only returned once to client
- **HttpOnly cookies**: Refresh tokens stored in secure, HttpOnly cookies for web clients

### 2. Password Security

#### Password Hashing
- **Algorithm**: bcrypt with configurable rounds (default: 10)
- **Environment**: `BCRYPT_ROUNDS` can be adjusted based on server capacity
- **Location**: `src/routes/auth.js`

#### Password Validation
- **Minimum length**: 8 characters
- **Maximum length**: 128 characters (prevents DoS via extremely long passwords)
- **Location**: `isValidPassword()` in `src/routes/auth.js`

#### Timing Attack Prevention
- **Login**: Always performs bcrypt comparison even if user doesn't exist
- **Comparison**: Uses constant-time comparison for sensitive operations
- **Location**: `src/routes/auth.js` POST `/auth/login`

### 3. Input Validation

#### Email Validation
- **Format**: Basic regex validation
- **Normalization**: Lowercase and trimmed on storage
- **Length limit**: 255 characters
- **Location**: `isValidEmail()` in `src/routes/auth.js`

#### Provider Validation (OAuth)
- **Pattern**: Alphanumeric, hyphens, underscores only
- **Prevents**: Path traversal and injection attacks
- **Location**: `src/routes/oauth.js`

### 4. OAuth Security (PKCE)

#### Authorization Code Flow with PKCE
- **Code verifier**: 64-character random string (base64url)
- **Code challenge**: SHA-256 hash of verifier
- **State parameter**: 32-character random hex for CSRF protection
- **Cookie storage**: Secure, HttpOnly, short-lived (10 min)
- **Location**: `src/lib/oauth.js`, `src/routes/oauth.js`

#### Provider Configuration
- **Validation**: Required fields checked before initiating flow
- **Environment-based**: Separate config per provider via env vars
- **Location**: `getProviderConfig()` in `src/lib/oauth.js`

### 5. Error Message Consistency

#### User Enumeration Prevention
- **Login**: Same error message whether user exists or password wrong
- **Password reset**: Always returns success, even if email doesn't exist
- **Token validation**: Generic "invalid or expired" messages
- **Location**: Throughout `src/routes/auth.js` and `src/routes/oauth.js`

### 6. JWT Best Practices

#### Token Configuration
- **Algorithm**: Explicitly set to HS256
- **Expiration**: Short-lived (15 minutes default)
- **Claims**: Required `sub` (user ID), optional issuer/audience
- **Verification**: Explicit algorithm whitelist on verification
- **Location**: `createAccessToken()` in `src/routes/auth.js`, `authenticate()` in `src/lib/authMiddleware.js`

### 7. Session Security

#### Cookie Configuration
- **HttpOnly**: Refresh tokens not accessible via JavaScript
- **SameSite**: `lax` to prevent CSRF
- **Secure**: Enabled in production (`NODE_ENV=production`)
- **MaxAge**: Matches token TTL
- **Location**: `src/routes/oauth.js` callback handler

### 8. Database Security

#### Prepared Statements
- **Implementation**: All queries use parameterized statements
- **Protection**: Prevents SQL injection
- **Location**: All database interactions use `$1`, `$2` placeholders

#### Transactions
- **Password reset**: Atomic update + token marking
- **Token rotation**: Atomic revoke + create
- **Location**: `src/lib/refreshTokens.js`, `src/routes/auth.js`

## TODO: Additional Security Measures

### Rate Limiting (High Priority)
- **Status**: Helper created (`src/lib/rateLimiter.js`) but not yet applied
- **Action Required**:
  ```javascript
  // In src/routes/auth.js
  const { loginLimiter, registerLimiter, passwordResetLimiter, tokenRefreshLimiter } = require('../lib/rateLimiter');
  
  router.post('/login', loginLimiter, async (req, res) => { ... });
  router.post('/register', registerLimiter, async (req, res) => { ... });
  router.post('/request-password-reset', passwordResetLimiter, async (req, res) => { ... });
  router.post('/token', tokenRefreshLimiter, async (req, res) => { ... });
  ```
- **Production**: Replace in-memory limiter with Redis-backed solution

### Account Lockout
- **Status**: Not implemented
- **Recommendation**: Lock account after N failed login attempts
- **Implementation**: Track failed attempts in `users` table or separate `login_attempts` table

### Multi-Factor Authentication (MFA)
- **Status**: Not implemented
- **Options**: TOTP (Google Authenticator), SMS, Email codes
- **Database**: Add `mfa_enabled`, `mfa_secret` columns to `users` table

### Audit Logging
- **Status**: Partial (console.error for critical events)
- **Enhancement**: Structured logging with user ID, IP, action, timestamp
- **Storage**: Dedicated `audit_log` table or external service (e.g., CloudWatch, Datadog)

### CORS Configuration
- **Status**: Basic CORS likely enabled in main server
- **Review**: Ensure `FRONTEND_BASE` whitelist is properly configured
- **Credentials**: `credentials: true` for cookie-based auth

### Content Security Policy (CSP)
- **Status**: Not auth-specific, but important
- **Recommendation**: Set CSP headers to prevent XSS

## Environment Variables Required

### Critical (Required in Production)
- `ACCESS_TOKEN_SECRET` — Minimum 32 characters, cryptographically random
- `OAUTH_REDIRECT_BASE` — Full URL of BFF (e.g., `https://api.niyati.app`)
- `FRONTEND_BASE` — Full URL of frontend (e.g., `https://niyati.app`)
- `DATABASE_URL` — PostgreSQL connection string

### Optional (With Defaults)
- `BCRYPT_ROUNDS` — Default: 10 (increase for higher security, decreases performance)
- `REFRESH_TOKEN_TTL_MS` — Default: 30 days (2592000000 ms)
- `ACCESS_TOKEN_EXPIRES` — Default: `15m`
- `PASSWORD_RESET_TTL_MS` — Default: 1 hour (3600000 ms)
- `NODE_ENV` — Set to `production` for production deployments

### OAuth Provider Configuration (per provider)
Example for Google:
- `OAUTH_GOOGLE_CLIENT_ID`
- `OAUTH_GOOGLE_CLIENT_SECRET`
- `OAUTH_GOOGLE_AUTHORIZE_URL` — Default: provider-specific
- `OAUTH_GOOGLE_TOKEN_URL` — Default: provider-specific
- `OAUTH_GOOGLE_USERINFO_URL` — Default: provider-specific
- `OAUTH_GOOGLE_SCOPES` — Default: `openid profile email`

## Deployment Checklist

### Pre-Production
- [ ] Generate strong `ACCESS_TOKEN_SECRET` (32+ characters)
- [ ] Configure all required OAuth providers
- [ ] Test token rotation and reuse detection
- [ ] Test password reset flow end-to-end
- [ ] Verify CORS configuration
- [ ] Enable HTTPS/TLS for all connections

### Production
- [ ] Set `NODE_ENV=production`
- [ ] Use production database with backups
- [ ] Apply rate limiting middleware to auth routes
- [ ] Enable structured audit logging
- [ ] Monitor failed login attempts
- [ ] Set up alerting for suspicious activity
- [ ] Configure session timeout policies
- [ ] Review and test disaster recovery procedures

### Post-Deployment Monitoring
- [ ] Track token refresh patterns
- [ ] Monitor failed authentication attempts
- [ ] Review audit logs regularly
- [ ] Test account recovery flows periodically
- [ ] Keep dependencies updated (especially `bcrypt`, `jsonwebtoken`, `express-rate-limit`)

## Testing Recommendations

### Security Testing
1. **Brute Force**: Verify rate limiting blocks repeated login attempts
2. **Token Reuse**: Confirm revoked token presentation revokes all user tokens
3. **CSRF**: Test OAuth state parameter validation
4. **SQL Injection**: Attempt injection in email/password fields
5. **Timing Attacks**: Ensure login timing is consistent (user exists vs. doesn't exist)
6. **Password Strength**: Verify weak passwords are rejected
7. **Session Fixation**: Confirm new session on login/OAuth callback

### Integration Testing
- See `tests/integration/oauth_flow.test.js` for OAuth flow testing
- See `tests/integration/refresh_rotation.test.js` for token rotation testing
- Add tests for password reset, registration validation, login attempts

## Incident Response

### Suspected Token Compromise
1. Identify affected user(s)
2. Revoke all refresh tokens for user: `UPDATE refresh_tokens SET revoked = true WHERE user_id = $1`
3. Force password reset if needed
4. Review audit logs for unauthorized activity
5. Notify user if personal data accessed

### Suspected Database Breach
1. Immediately rotate `ACCESS_TOKEN_SECRET` (invalidates all access tokens)
2. Revoke all refresh tokens: `UPDATE refresh_tokens SET revoked = true`
3. Force password reset for all users
4. Review and patch vulnerability
5. Notify users and authorities as required by regulations (GDPR, etc.)

## References

- [OWASP Authentication Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html)
- [OAuth 2.0 Security Best Practices](https://datatracker.ietf.org/doc/html/draft-ietf-oauth-security-topics)
- [PKCE RFC 7636](https://datatracker.ietf.org/doc/html/rfc7636)
- [JWT Best Practices RFC 8725](https://datatracker.ietf.org/doc/html/rfc8725)
