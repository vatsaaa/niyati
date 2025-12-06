const express = require('express');
const { createRawToken, hashToken, findRefreshTokenByHash, rotateRefreshToken, revokeRefreshToken, storeRefreshToken } = require('../lib/refreshTokens');
const jwt = require('jsonwebtoken');
const config = require('../../config');
const { createRawToken: prCreateRaw, hashToken: prHash, storePasswordReset, findByHash, markUsed } = require('../lib/passwordReset');
const { sendMail } = require('../lib/emailProvider');
const { authenticate } = require('../lib/authMiddleware');
const { ErrorCodes } = require('../lib/responses');

const router = express.Router();
const bcrypt = require('bcrypt');

const DEFAULT_BCRYPT_ROUNDS = process.env.BCRYPT_ROUNDS ? parseInt(process.env.BCRYPT_ROUNDS, 10) : 10;

// Helper: create and persist refresh token for a user, return raw token
async function createAndStoreRefreshForUser(db, userId) {
  const raw = createRawToken();
  const tokenHash = hashToken(raw);
  const expiresAt = new Date(Date.now() + (process.env.REFRESH_TOKEN_TTL_MS ? parseInt(process.env.REFRESH_TOKEN_TTL_MS, 10) : 30 * 24 * 60 * 60 * 1000));
  await storeRefreshToken(db, { userId, tokenHash, expiresAt });
  return { raw, expiresAt };
}

// Helper to create access token (JWT). Requires ACCESS_TOKEN_SECRET env var.
function createAccessToken(payload, opts = {}) {
  const secret = process.env.ACCESS_TOKEN_SECRET || 'dev-secret';
  const expiresIn = opts.expiresIn || '15m';
  return jwt.sign(payload, secret, { expiresIn });
}

// POST /auth/token
// Accepts { refresh_token } in body (or cookie in future)
router.post('/token', async (req, res) => {
  try {
    const raw = req.body && (req.body.refresh_token || req.body.token);
    if (!raw) return res.sendError(ErrorCodes.BAD_REQUEST, 'Missing refresh token');

    const db = req.app.get('db');
    if (!db) return res.sendError(ErrorCodes.INTERNAL_SERVER_ERROR, 'Database not configured');

    const tokenHash = hashToken(raw);
    const row = await findRefreshTokenByHash(db, tokenHash);
    if (!row) return res.sendError(ErrorCodes.UNAUTHORIZED, 'Refresh token not found');
    if (row.revoked) return res.sendError(ErrorCodes.UNAUTHORIZED, 'Refresh token revoked');
    if (new Date(row.expires_at) < new Date()) return res.sendError(ErrorCodes.UNAUTHORIZED, 'Refresh token expired');

    // Rotate: create new refresh token and revoke old
    const newRaw = createRawToken();
    const newHash = hashToken(newRaw);
    const expiresAt = new Date(Date.now() + (process.env.REFRESH_TOKEN_TTL_MS ? parseInt(process.env.REFRESH_TOKEN_TTL_MS, 10) : 30 * 24 * 60 * 60 * 1000)); // default 30 days

    const newRow = await rotateRefreshToken(db, { oldTokenId: row.id, userId: row.user_id, newTokenHash: newHash, expiresAt });

    // Issue access token (JWT) with short expiry
    const accessToken = createAccessToken({ sub: row.user_id });

    return res.sendSuccess({ access_token: accessToken, token_type: 'bearer', expires_in: 15 * 60, refresh_token: newRaw });
  } catch (err) {
    return res.sendError(ErrorCodes.INTERNAL_SERVER_ERROR, err.message);
  }
});

// POST /auth/logout
// Accepts { refresh_token } to revoke
router.post('/logout', async (req, res) => {
  try {
    const raw = req.body && req.body.refresh_token;
    if (!raw) return res.sendError(ErrorCodes.BAD_REQUEST, 'Missing refresh token');

    const db = req.app.get('db');
    if (!db) return res.sendError(ErrorCodes.INTERNAL_SERVER_ERROR, 'Database not configured');

    const tokenHash = hashToken(raw);
    const row = await findRefreshTokenByHash(db, tokenHash);
    if (!row) return res.sendSuccess({ revoked: false });

    await revokeRefreshToken(db, row.id);
    return res.sendSuccess({ revoked: true });
  } catch (err) {
    return res.sendError(ErrorCodes.INTERNAL_SERVER_ERROR, err.message);
  }
});

// POST /auth/register
// Body: { email, password, name }
router.post('/register', async (req, res) => {
  try {
    const { email, password, name } = req.body || {};
    if (!email || !password) return res.sendError(ErrorCodes.BAD_REQUEST, 'Email and password are required');

    const db = req.app.get('db');
    if (!db) return res.sendError(ErrorCodes.INTERNAL_SERVER_ERROR, 'Database not configured');

    // Check for existing user
    const existing = await db.query('SELECT id FROM users WHERE lower(email) = lower($1) LIMIT 1', [email]);
    if (existing.rowCount > 0) return res.sendError(ErrorCodes.CONFLICT, 'Email already registered');

    const passwordHash = await bcrypt.hash(password, DEFAULT_BCRYPT_ROUNDS);
    const insertSql = `INSERT INTO users (email, password_hash, name, created_at, updated_at) VALUES ($1, $2, $3, now(), now()) RETURNING id`;
    const insertRes = await db.query(insertSql, [email, passwordHash, name || null]);
    const userId = insertRes.rows[0].id;

    // Create refresh token
    const { raw: refreshRaw } = await createAndStoreRefreshForUser(db, userId);

    const accessToken = createAccessToken({ sub: userId });
    return res.sendSuccess({ user_id: userId, access_token: accessToken, refresh_token: refreshRaw });
  } catch (err) {
    return res.sendError(ErrorCodes.INTERNAL_SERVER_ERROR, err.message);
  }
});

// POST /auth/login
// Body: { email, password }
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) return res.sendError(ErrorCodes.BAD_REQUEST, 'Email and password are required');

    const db = req.app.get('db');
    if (!db) return res.sendError(ErrorCodes.INTERNAL_SERVER_ERROR, 'Database not configured');

    const userRes = await db.query('SELECT id, password_hash FROM users WHERE lower(email) = lower($1) LIMIT 1', [email]);
    if (userRes.rowCount === 0) return res.sendError(ErrorCodes.UNAUTHORIZED, 'Invalid email or password');
    const user = userRes.rows[0];

    const ok = await bcrypt.compare(password, user.password_hash || '');
    if (!ok) return res.sendError(ErrorCodes.UNAUTHORIZED, 'Invalid email or password');

    // Create refresh token
    const { raw: refreshRaw } = await createAndStoreRefreshForUser(db, user.id);
    const accessToken = createAccessToken({ sub: user.id });
    // Update last_login timestamp
    await db.query('UPDATE users SET last_login = now() WHERE id = $1', [user.id]);

    return res.sendSuccess({ user_id: user.id, access_token: accessToken, refresh_token: refreshRaw });
  } catch (err) {
    return res.sendError(ErrorCodes.INTERNAL_SERVER_ERROR, err.message);
  }
});

// POST /auth/request-password-reset
// Body: { email }
router.post('/request-password-reset', async (req, res) => {
  try {
    const { email } = req.body || {};
    if (!email) return res.sendError(ErrorCodes.BAD_REQUEST, 'Email required');

    const db = req.app.get('db');
    if (!db) return res.sendError(ErrorCodes.INTERNAL_SERVER_ERROR, 'Database not configured');

    const userRes = await db.query('SELECT id, email FROM users WHERE lower(email) = lower($1) LIMIT 1', [email]);
    if (userRes.rowCount === 0) return res.sendSuccess({ requested: true }); // don't reveal existence

    const user = userRes.rows[0];
    const raw = prCreateRaw();
    const tokenHash = prHash(raw);
    const expiresAt = new Date(Date.now() + (process.env.PASSWORD_RESET_TTL_MS ? parseInt(process.env.PASSWORD_RESET_TTL_MS, 10) : 1000 * 60 * 60)); // 1 hour
    await storePasswordReset(db, { userId: user.id, tokenHash, expiresAt });

    const resetUrl = `${process.env.FRONTEND_BASE || ''}/reset-password?token=${encodeURIComponent(raw)}`;
    await sendMail({ to: user.email, subject: 'Password reset', text: `Reset your password: ${resetUrl}`, html: `<p>Reset your password: <a href="${resetUrl}">${resetUrl}</a></p>` });

    return res.sendSuccess({ requested: true });
  } catch (err) {
    return res.sendError(ErrorCodes.INTERNAL_SERVER_ERROR, err.message);
  }
});

// POST /auth/reset-password
// Body: { token, new_password }
router.post('/reset-password', async (req, res) => {
  try {
    const { token, new_password } = req.body || {};
    if (!token || !new_password) return res.sendError(ErrorCodes.BAD_REQUEST, 'Token and new_password required');

    const db = req.app.get('db');
    if (!db) return res.sendError(ErrorCodes.INTERNAL_SERVER_ERROR, 'Database not configured');

    const tokenHash = prHash(token);
    const row = await findByHash(db, tokenHash);
    if (!row) return res.sendError(ErrorCodes.UNAUTHORIZED, 'Invalid or expired token');
    if (row.used) return res.sendError(ErrorCodes.UNAUTHORIZED, 'Token already used');
    if (new Date(row.expires_at) < new Date()) return res.sendError(ErrorCodes.UNAUTHORIZED, 'Token expired');

    // Update user's password
    const passwordHash = await bcrypt.hash(new_password, DEFAULT_BCRYPT_ROUNDS);
    await db.query('UPDATE users SET password_hash = $1, updated_at = now() WHERE id = $2', [passwordHash, row.user_id]);
    await markUsed(db, row.id);

    return res.sendSuccess({ reset: true });
  } catch (err) {
    return res.sendError(ErrorCodes.INTERNAL_SERVER_ERROR, err.message);
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
        const secret = process.env.ACCESS_TOKEN_SECRET || 'dev-secret';
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

module.exports = router;
