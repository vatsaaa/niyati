const express = require('express');
const { createRawToken, hashToken, findRefreshTokenByHash, rotateRefreshToken, revokeRefreshToken, storeRefreshToken } = require('./refreshTokens');
const {
  auth: commonAuth,
  utils: commonUtils,
  ErrorCodes
} = require('@niyati/commons');
const { createAccessToken } = commonAuth;
const { isValidEmail, isValidPassword, timingSafeEqual } = commonUtils;
function RC(codeName) { return ErrorCodes[codeName] || codeName; }
const { createRawToken: prCreateRaw, hashToken: prHash, storePasswordReset, findByHash, markUsed } = require('./passwordReset');
const { sendMail } = require('./emailProvider');
const { authenticate } = require('./authMiddleware');
const crypto = require('crypto');
const { handleCallback, fetchUserInfo } = require('../src/socialLogin');
const rateLimit = require('express-rate-limit');
const { passwordResetLimiter } = require('@niyati/commons/lib/rateLimiter');

const router = express.Router();
const bcrypt = require('bcryptjs');

const DEFAULT_BCRYPT_ROUNDS = process.env.BCRYPT_ROUNDS ? parseInt(process.env.BCRYPT_ROUNDS, 10) : 10;

// Rate limiters
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 attempts per window per IP
  message: {
    status: 'error',
    code: 'TOO_MANY_REQUESTS',
    message: 'Too many login attempts, please try again later'
  },
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
});

// Shared logic migrated to be/commons/lib/utils.js

// Helper: create and persist refresh token for a user, return raw token
async function createAndStoreRefreshForUser(db, userId) {
  const raw = createRawToken();
  const tokenHash = hashToken(raw);
  const expiresAt = new Date(Date.now() + (process.env.REFRESH_TOKEN_TTL_MS ? parseInt(process.env.REFRESH_TOKEN_TTL_MS, 10) : 30 * 24 * 60 * 60 * 1000));
  await storeRefreshToken(db, { userId, tokenHash, expiresAt });
  return { raw, expiresAt };
}

// Helper to create access token (JWT) migrated to be/commons/lib/auth.js

// Helper: set refresh token cookie
function setRefreshCookie(res, token) {
  const cookieOptions = {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    // Allow explicit opt-in for cross-site cookies (ngrok/tunneling).
    // To enable cross-site cookies (needed when the app is served from a different host),
    // set environment variable `ALLOW_CROSS_SITE_COOKIES=true` in production environment.
    sameSite: process.env.ALLOW_CROSS_SITE_COOKIES === 'true' ? 'none' : (process.env.NODE_ENV === 'production' ? 'lax' : 'lax'),
    path: '/api/v1/auth',
    maxAge: process.env.REFRESH_TOKEN_TTL_MS ? parseInt(process.env.REFRESH_TOKEN_TTL_MS, 10) : 30 * 24 * 60 * 60 * 1000
  };
  res.cookie('refresh_token', token, cookieOptions);
}

// POST /auth/token
// Accepts { refresh_token } in body (or cookie in future)
router.post('/token', async (req, res) => {
  try {
    const raw = (req.body && req.body.refresh_token) || (req.cookies && req.cookies.refresh_token);
    if (!raw || typeof raw !== 'string' || raw.length === 0) {
      return res.sendError(RC('BAD_REQUEST'), 'Invalid refresh token');
    }
    if (raw.length > 500) {
      return res.sendError(RC('BAD_REQUEST'), 'Refresh token exceeds maximum length');
    }

    const db = req.app.get('db');
    if (!db) return res.sendError(RC('INTERNAL_SERVER_ERROR'), 'Database not configured');

    const tokenHash = hashToken(raw);
    const row = await findRefreshTokenByHash(db, tokenHash, true); // Update last_used_at

    // Use consistent error message to prevent token enumeration
    const invalidTokenMsg = 'Invalid or expired refresh token';

    if (!row) return res.sendError(RC('UNAUTHORIZED'), invalidTokenMsg);
    if (row.revoked) {
      // Token reuse detected - revoke all tokens for this user as security measure
      try {
        await db.query('UPDATE refresh_tokens SET revoked = true, updated_at = now() WHERE user_id = $1 AND revoked = false', [row.user_id]);
      } catch (revokeErr) {
        console.error('Failed to revoke tokens:', revokeErr);
      }
      return res.sendError(RC('UNAUTHORIZED'), invalidTokenMsg);
    }
    if (new Date(row.expires_at) < new Date()) {
      return res.sendError(RC('UNAUTHORIZED'), invalidTokenMsg);
    }

    // Detect potential token reuse (same token used within suspicious timeframe)
    if (row.last_used_at) {
      const timeSinceLastUse = Date.now() - new Date(row.last_used_at).getTime();
      if (timeSinceLastUse < 1000) { // Less than 1 second - likely replay attack
        await db.query('UPDATE refresh_tokens SET revoked = true WHERE user_id = $1', [row.user_id]);
        return res.sendError(RC('UNAUTHORIZED'), invalidTokenMsg);
      }
    }

    // Rotate: create new refresh token and revoke old
    const newRaw = createRawToken();
    const newHash = hashToken(newRaw);
    const expiresAt = new Date(Date.now() + (process.env.REFRESH_TOKEN_TTL_MS ? parseInt(process.env.REFRESH_TOKEN_TTL_MS, 10) : 30 * 24 * 60 * 60 * 1000));

    const newRow = await rotateRefreshToken(db, { oldTokenId: row.id, userId: row.user_id, newTokenHash: newHash, expiresAt });

    // Issue access token (JWT) with short expiry
    const accessToken = createAccessToken({ sub: row.user_id });

    setRefreshCookie(res, newRaw);

    return res.sendSuccess({ access_token: accessToken, token_type: 'bearer', expires_in: 15 * 60 });
  } catch (err) {
    console.error('Token rotation error:', err);
    return res.sendError(_responses().ErrorCodes.INTERNAL_SERVER_ERROR, 'Authentication failed');
  }
});

// POST /auth/logout
// Accepts { refresh_token } to revoke
router.post('/logout', async (req, res) => {
  try {
    const raw = (req.body && req.body.refresh_token) || (req.cookies && req.cookies.refresh_token);
    if (!raw || typeof raw !== 'string') {
      return res.sendError(RC('BAD_REQUEST'), 'Missing refresh token');
    }

    const db = req.app.get('db');
    if (!db) return res.sendError(RC('INTERNAL_SERVER_ERROR'), 'Database not configured');

    const tokenHash = hashToken(raw);
    const row = await findRefreshTokenByHash(db, tokenHash);
    if (!row) {
      // Clear cookie anyway
      res.clearCookie('refresh_token', { path: '/api/v1/auth' });
      return res.sendSuccess({ revoked: false });
    }

    await revokeRefreshToken(db, row.id);
    res.clearCookie('refresh_token', { path: '/api/v1/auth' });
    return res.sendSuccess({ revoked: true });
  } catch (err) {
    console.error('Logout error:', err?.message || err);
    return res.sendError(RC('INTERNAL_SERVER_ERROR'), 'Logout failed');
  }
});

// POST /auth/register
// Body: { email, password, name }
router.post('/register', async (req, res) => {
  try {
    const { email, password, name } = req.body || {};

    // Validate email
    if (!isValidEmail(email)) {
      return res.sendError(_responses().ErrorCodes.VALIDATION_ERROR, 'Invalid email format');
    }

    // Validate password strength
    if (!isValidPassword(password)) {
      return res.sendError(_responses().ErrorCodes.VALIDATION_ERROR, 'Password must be at least 8 characters');
    }

    // Validate name if provided
    if (name && (typeof name !== 'string' || name.length > 100)) {
      return res.sendError(RC('VALIDATION_ERROR'), 'Name must be less than 100 characters');
    }

    const db = req.app.get('db');
    if (!db) return res.sendError(RC('INTERNAL_SERVER_ERROR'), 'Database not configured');

    // Check for existing user (normalize email)
    const normalizedEmail = email.toLowerCase().trim();
    const existing = await db.query('SELECT id FROM users WHERE lower(email) = $1 LIMIT 1', [normalizedEmail]);
    if (existing.rowCount > 0) {
      return res.sendError(RC('CONFLICT'), 'Email already registered');
    }

    const passwordHash = await bcrypt.hash(password, DEFAULT_BCRYPT_ROUNDS);
    const insertSql = `INSERT INTO users (email, password_hash, name, created_at, updated_at) VALUES ($1, $2, $3, now(), now()) RETURNING id`;
    const insertRes = await db.query(insertSql, [email.toLowerCase().trim(), passwordHash, name ? name.trim() : null]);
    const userId = insertRes.rows[0].id;

    // Create refresh token
    const { raw: refreshRaw } = await createAndStoreRefreshForUser(db, userId);

    setRefreshCookie(res, refreshRaw);

    const accessToken = createAccessToken({ sub: userId });
    return res.sendSuccess({ user_id: userId, access_token: accessToken });
  } catch (err) {
    console.error('Registration error:', err);
    return res.sendError(_responses().ErrorCodes.INTERNAL_SERVER_ERROR, 'Registration failed');
  }
});

// POST /auth/login
// Body: { email, password }
router.post('/login', loginLimiter, async (req, res) => {
  try {
    const { email, password } = req.body || {};

    // Consistent error message to prevent user enumeration
    const invalidCredsMsg = 'Invalid email or password';

    if (!isValidEmail(email) || !password) {
      return res.sendError(RC('UNAUTHORIZED'), invalidCredsMsg);
    }

    const db = req.app.get('db');
    if (!db) return res.sendError(_responses().ErrorCodes.INTERNAL_SERVER_ERROR, 'Database not configured');

    const userRes = await db.query('SELECT id, password_hash FROM users WHERE lower(email) = lower($1) LIMIT 1', [email]);

    // Always perform bcrypt comparison even if user not found (timing attack prevention)
    const user = userRes.rows[0];
    const hashToCompare = user?.password_hash || '$2b$10$invalidhashfortimingatttackprevention';
    const ok = await bcrypt.compare(password, hashToCompare);

    if (!user || !ok) {
      return res.sendError(RC('UNAUTHORIZED'), invalidCredsMsg);
    }

    // Create refresh token
    const { raw: refreshRaw } = await createAndStoreRefreshForUser(db, user.id);
    const accessToken = createAccessToken({ sub: user.id });

    setRefreshCookie(res, refreshRaw);

    // Update last_login timestamp (non-blocking)
    db.query('UPDATE users SET last_login = now() WHERE id = $1', [user.id]).catch(err => {
      console.error('Failed to update last_login:', err);
    });

    return res.sendSuccess({ user_id: user.id, access_token: accessToken });
  } catch (err) {
    console.error('Login error:', err);
    return res.sendError(_responses().ErrorCodes.INTERNAL_SERVER_ERROR, 'Authentication failed');
  }
});

// POST /auth/request-password-reset
// Body: { email }
router.post('/request-password-reset', passwordResetLimiter, async (req, res) => {
  try {
    const { email } = req.body || {};

    if (!isValidEmail(email)) {
      // Still return success to prevent email enumeration
      return res.sendSuccess({ requested: true });
    }

    const db = req.app.get('db');
    if (!db) return res.sendError(ErrorCodes.INTERNAL_SERVER_ERROR, 'Database not configured');

    const userRes = await db.query('SELECT id, email FROM users WHERE lower(email) = lower($1) LIMIT 1', [email]);
    if (userRes.rowCount === 0) {
      // Don't reveal whether email exists
      return res.sendSuccess({ requested: true });
    }

    const user = userRes.rows[0];

    // Check for recent reset requests to prevent spam
    const recentReset = await db.query(
      'SELECT id FROM password_resets WHERE user_id = $1 AND created_at > now() - interval \'5 minutes\' LIMIT 1',
      [user.id]
    );
    if (recentReset.rowCount > 0) {
      // Silently succeed but don't send another email
      return res.sendSuccess({ requested: true });
    }

    const raw = prCreateRaw();
    const tokenHash = prHash(raw);
    const expiresAt = new Date(Date.now() + (process.env.PASSWORD_RESET_TTL_MS ? parseInt(process.env.PASSWORD_RESET_TTL_MS, 10) : 1000 * 60 * 60));
    await storePasswordReset(db, { userId: user.id, tokenHash, expiresAt });

    const resetUrl = `${process.env.FRONTEND_BASE || ''}/reset-password?token=${encodeURIComponent(raw)}`;

    // Send email asynchronously (non-blocking)
    sendMail({
      to: user.email,
      subject: 'Password Reset Request',
      text: `Reset your password: ${resetUrl}\n\nThis link expires in 1 hour.`,
      html: `<p>Reset your password: <a href="${resetUrl}">${resetUrl}</a></p><p>This link expires in 1 hour.</p>`
    }).catch(err => {
      console.error('Failed to send password reset email:', err);
    });

    return res.sendSuccess({ requested: true });
  } catch (err) {
    console.error('Password reset request error:', err);
    // Always return success to prevent enumeration
    return res.sendSuccess({ requested: true });
  }
});

// POST /auth/reset-password
// Body: { token, new_password }
router.post('/reset-password', async (req, res) => {
  try {
    const { token, new_password } = req.body || {};

    const invalidTokenMsg = 'Invalid or expired reset token';

    if (!token || typeof token !== 'string') {
      return res.sendError(RC('BAD_REQUEST'), invalidTokenMsg);
    }

    if (!isValidPassword(new_password)) {
      return res.sendError(RC('VALIDATION_ERROR'), 'Password must be at least 8 characters');
    }

    const db = req.app.get('db');
    if (!db) return res.sendError(ErrorCodes.INTERNAL_SERVER_ERROR, 'Database not configured');

    const tokenHash = prHash(token);
    const row = await findByHash(db, tokenHash);

    if (!row || row.used || new Date(row.expires_at) < new Date()) {
      return res.sendError(ErrorCodes.UNAUTHORIZED, invalidTokenMsg);
    }

    // Use transaction to ensure atomicity
    await db.query('BEGIN');
    try {
      // Update user's password
      const passwordHash = await bcrypt.hash(new_password, DEFAULT_BCRYPT_ROUNDS);
      await db.query('UPDATE users SET password_hash = $1, updated_at = now() WHERE id = $2', [passwordHash, row.user_id]);
      await markUsed(db, row.id);

      // Revoke all existing refresh tokens for security
      await db.query('UPDATE refresh_tokens SET revoked = true WHERE user_id = $1', [row.user_id]);

      await db.query('COMMIT');
    } catch (err) {
      await db.query('ROLLBACK');
      throw err;
    }

    return res.sendSuccess({ reset: true });
  } catch (err) {
    console.error('Password reset error:', err);
    return res.sendError(ErrorCodes.INTERNAL_SERVER_ERROR, 'Password reset failed');
  }
});

// POST /auth/link - link an OAuth provider to the authenticated user
// Body: { provider, provider_id, token_meta }
router.post('/link', authenticate, async (req, res) => {
  try {
    const { provider, provider_id, token_meta } = req.body || {};
    if (!provider || !provider_id) return res.sendError(ErrorCodes.BAD_REQUEST, 'provider and provider_id required');

    const db = req.app.get('db');
    if (!db) return res.sendError(ErrorCodes.INTERNAL_SERVER_ERROR, 'Database not configured');

    // Prevent linking if already linked to another user
    const existing = await db.query('SELECT id, user_id FROM oauth_accounts WHERE provider = $1 AND provider_id = $2 LIMIT 1', [provider, provider_id]);
    if (existing.rowCount > 0) return res.sendError(ErrorCodes.CONFLICT, 'Account already linked');

    const insert = await db.query('INSERT INTO oauth_accounts (user_id, provider, provider_id, token_meta, created_at) VALUES ($1, $2, $3, $4, now()) RETURNING id', [req.user.id, provider, provider_id, token_meta || null]);
    return res.sendSuccess({ linked: true, id: insert.rows[0].id });
  } catch (err) {
    return res.sendError(ErrorCodes.INTERNAL_SERVER_ERROR, err.message);
  }
});

// POST /auth/unlink - unlink provider
// Body: { provider }
router.post('/unlink', authenticate, async (req, res) => {
  try {
    const { provider } = req.body || {};
    if (!provider) return res.sendError(ErrorCodes.BAD_REQUEST, 'provider required');

    const db = req.app.get('db');
    if (!db) return res.sendError(ErrorCodes.INTERNAL_SERVER_ERROR, 'Database not configured');

    // Ensure user has at least one sign-in method after unlink
    const linkedRes = await db.query('SELECT id FROM oauth_accounts WHERE user_id = $1 AND provider != $2', [req.user.id, provider]);
    const hasPasswordRes = await db.query('SELECT password_hash FROM users WHERE id = $1', [req.user.id]);
    const hasPassword = hasPasswordRes.rows[0] && hasPasswordRes.rows[0].password_hash;
    if (linkedRes.rowCount === 0 && !hasPassword) return res.sendError(ErrorCodes.CONFLICT, 'Cannot unlink last sign-in method');

    await db.query('DELETE FROM oauth_accounts WHERE user_id = $1 AND provider = $2', [req.user.id, provider]);
    return res.sendSuccess({ unlinked: true });
  } catch (err) {
    return res.sendError(ErrorCodes.INTERNAL_SERVER_ERROR, err.message);
  }
});

// Utility route: create refresh token for a user (test/dev helper) - not mounted in production
router.post('/_create_refresh', async (req, res) => {
  try {
    const { user_id } = req.body || {};
    if (!user_id) return res.sendError(ErrorCodes.BAD_REQUEST, 'Missing user_id');
    const db = req.app.get('db');
    if (!db) return res.sendError(ErrorCodes.INTERNAL_SERVER_ERROR, 'Database not configured');

    const raw = createRawToken();
    const tokenHash = hashToken(raw);
    const expiresAt = new Date(Date.now() + (process.env.REFRESH_TOKEN_TTL_MS ? parseInt(process.env.REFRESH_TOKEN_TTL_MS, 10) : 30 * 24 * 60 * 60 * 1000));
    const row = await storeRefreshToken(db, { userId: user_id, tokenHash, expiresAt });
    return res.sendSuccess({ refresh_token: raw, id: row.id, expires_at: row.expires_at });
  } catch (err) {
    return res.sendError(ErrorCodes.INTERNAL_SERVER_ERROR, err.message);
  }
});

// GET /auth/me - return authenticated user's profile
// Accepts Authorization: Bearer <access_token> or HttpOnly cookie `refresh_token`
router.get('/me', async (req, res) => {
  try {
    const db = req.app.get('db');
    if (!db) return res.sendError(ErrorCodes.INTERNAL_SERVER_ERROR, 'Database not configured');

    // Try Authorization header first
    const auth = (req.headers.authorization || '').toString();
    if (auth.startsWith('Bearer ')) {
      const token = auth.slice(7);
      try {
        const secret = process.env.ACCESS_TOKEN_SECRET;
        if (!secret) {
          logger.error({ msg: 'ACCESS_TOKEN_SECRET not configured' });
          return res.sendError(ErrorCodes.INTERNAL_SERVER_ERROR, 'Authentication not configured');
        }
        const payload = jwt.verify(token, secret);
        const userId = payload.sub;
        const userRes = await db.query('SELECT id, email, name, avatar_url, created_at, updated_at, last_login FROM users WHERE id = $1 LIMIT 1', [userId]);
        if (userRes.rowCount === 0) return res.sendError(ErrorCodes.NOT_FOUND, 'User not found');
        return res.sendSuccess({ user: userRes.rows[0] });
      } catch (err) {
        return res.sendError(ErrorCodes.UNAUTHORIZED, 'Invalid access token');
      }
    }

    // Fallback: check refresh_token cookie
    const raw = req.cookies && req.cookies.refresh_token;
    if (!raw) return res.sendError(ErrorCodes.UNAUTHORIZED, 'Missing authentication');
    const tokenHash = hashToken(raw);
    const row = await findRefreshTokenByHash(db, tokenHash);
    if (!row || row.revoked || new Date(row.expires_at) < new Date()) return res.sendError(ErrorCodes.UNAUTHORIZED, 'Invalid or expired session');

    const userRes = await db.query('SELECT id, email, name, avatar_url, created_at, updated_at, last_login FROM users WHERE id = $1 LIMIT 1', [row.user_id]);
    if (userRes.rowCount === 0) return res.sendError(ErrorCodes.NOT_FOUND, 'User not found');
    return res.sendSuccess({ user: userRes.rows[0] });
  } catch (err) {
    return res.sendError(ErrorCodes.INTERNAL_SERVER_ERROR, err.message);
  }
});

// GET /auth/:provider - redirect to OAuth provider
// provider: google, github, apple
router.get('/:provider', (req, res) => {
  const { provider } = req.params;
  const { getProviderRedirect } = require('../src/socialLogin');
  try {
    const url = getProviderRedirect(provider);
    res.redirect(url);
  } catch (err) {
    res.sendError(RC('BAD_REQUEST'), err.message);
  }
});

// POST /auth/oauth/callback
// Body: { provider, code, code_verifier, redirect_uri }
router.post('/oauth/callback', async (req, res) => {
  try {
    const { provider, code, code_verifier: codeVerifier, redirect_uri: redirectUri } = req.body || {};
    if (!provider || !code) return res.sendError(RC('BAD_REQUEST'), 'provider and code required');

    const db = req.app.get('db');
    if (!db) return res.sendError(RC('INTERNAL_SERVER_ERROR'), 'Database not configured');

    // Exchange code for tokens
    const tokens = await handleCallback({ code, provider, codeVerifier, redirectUri });

    // Fetch user info
    const userInfo = await fetchUserInfo(provider, tokens) || {};
    const providerId = userInfo.sub || userInfo.id || userInfo.user_id || userInfo.sub_jwk;
    const email = userInfo.email || null;
    const name = userInfo.name || userInfo.displayName || null;
    const avatar = userInfo.picture || userInfo.avatar_url || null;

    if (!providerId) return res.sendError(RC('BAD_REQUEST'), 'Unable to determine provider user id');

    // Find existing oauth account
    const existing = await db.query('SELECT user_id FROM oauth_accounts WHERE provider = $1 AND provider_id = $2 LIMIT 1', [provider, providerId]);
    let userId;

    await db.query('BEGIN');
    try {
      if (existing.rowCount > 0) {
        userId = existing.rows[0].user_id;
      } else {
        // If a local user exists with same email, link to that user. Otherwise create new user.
        if (email) {
          const userRes = await db.query('SELECT id FROM users WHERE lower(email) = lower($1) LIMIT 1', [email]);
          if (userRes.rowCount > 0) {
            userId = userRes.rows[0].id;
          }
        }

        if (!userId) {
          const insert = await db.query('INSERT INTO users (email, name, avatar_url, created_at, updated_at) VALUES ($1, $2, $3, now(), now()) RETURNING id', [email, name, avatar]);
          userId = insert.rows[0].id;
        }

        // Insert oauth_accounts link
        await db.query('INSERT INTO oauth_accounts (user_id, provider, provider_id, token_meta, created_at) VALUES ($1, $2, $3, $4, now())', [userId, provider, providerId, tokens ? JSON.stringify(tokens) : null]);
      }

      // Create refresh and access tokens
      const { raw: refreshRaw } = await createAndStoreRefreshForUser(db, userId);
      const accessToken = createAccessToken({ sub: userId });

      await db.query('COMMIT');

      setRefreshCookie(res, refreshRaw);
      return res.sendSuccess({ user_id: userId, access_token: accessToken });
    } catch (err) {
      await db.query('ROLLBACK');
      throw err;
    }
  } catch (err) {
    console.error('OAuth callback error:', err);
    return res.sendError(RC('INTERNAL_SERVER_ERROR'), 'OAuth callback failed');
  }
});

module.exports = router;

