const express = require('express');
const rateLimit = require('express-rate-limit');
const { ErrorCodes } = require('@niyati/commons');
const { passwordResetLimiter } = require('@niyati/commons/lib/rateLimiter');
const { createAuthFlows } = require('@niyati/auth-core/lib/authFlows');
const { createPasswordHasher } = require('@niyati/auth-core/lib/passwordHasher');
const { createJwtProvider } = require('@niyati/auth-core/lib/jwt');
const {
  createRefreshTokenStore,
  createRawToken: rtCreateRaw,
  hashToken: rtHash,
} = require('@niyati/auth-core/lib/refreshTokens');
const {
  createPasswordResetStore,
  createRawToken: prCreateRaw,
  hashToken: prHash,
} = require('@niyati/auth-core/lib/passwordReset');
const { isValidEmail, isValidPassword } = require('@niyati/auth-core/lib/utils');
const { handleCallback, fetchUserInfo, getProviderRedirect } = require('@niyati/auth-core/lib/socialLogin');
const { sendMail } = require('@niyati/auth-core/lib/emailProvider');
const { authenticate } = require('./authMiddleware');
const userRepo = require('./userRepo');
const oauthRepo = require('./oauthRepo');

const router = express.Router();

function RC(codeName) { return ErrorCodes[codeName] || codeName; }

// ─── Rate limiters ───────────────────────────────────

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { status: 'error', code: 'TOO_MANY_REQUESTS', message: 'Too many login attempts, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
});

// ─── Auth flows wired with niyati config ─────────────

const jwtProvider = createJwtProvider({
  secret: process.env.ACCESS_TOKEN_SECRET,
  issuer: 'niyati-bff',
  audience: 'niyati-app',
  expiresIn: process.env.ACCESS_TOKEN_EXPIRES || '15m',
});

const refreshTokenStore = createRefreshTokenStore({ tableName: 'refresh_tokens' });
const passwordResetStore = createPasswordResetStore({ tableName: 'password_resets' });
const passwordHasher = createPasswordHasher({
  rounds: process.env.BCRYPT_ROUNDS ? parseInt(process.env.BCRYPT_ROUNDS, 10) : 10,
});

const flows = createAuthFlows({
  jwtProvider,
  refreshTokenStore,
  refreshTokenHelpers: { createRawToken: rtCreateRaw, hashToken: rtHash },
  passwordResetStore,
  passwordResetHelpers: { createRawToken: prCreateRaw, hashToken: prHash },
  passwordHasher,
  userRepo,
  oauthRepo,
  emailSender: sendMail,
  socialLogin: { handleCallback, fetchUserInfo },
  validators: { isValidEmail, isValidPassword },
  config: {
    refreshTokenTtlMs: process.env.REFRESH_TOKEN_TTL_MS ? parseInt(process.env.REFRESH_TOKEN_TTL_MS, 10) : undefined,
    passwordResetTtlMs: process.env.PASSWORD_RESET_TTL_MS ? parseInt(process.env.PASSWORD_RESET_TTL_MS, 10) : undefined,
    frontendBase: process.env.FRONTEND_BASE || '',
  },
});

// ─── Helpers ─────────────────────────────────────────

function setRefreshCookie(res, token) {
  res.cookie('refresh_token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: process.env.ALLOW_CROSS_SITE_COOKIES === 'true' ? 'none' : 'lax',
    path: '/api/v1/auth',
    maxAge: process.env.REFRESH_TOKEN_TTL_MS ? parseInt(process.env.REFRESH_TOKEN_TTL_MS, 10) : 30 * 24 * 60 * 60 * 1000,
  });
}

function getDb(req, res) {
  const db = req.app.get('db');
  if (!db) { res.sendError(RC('INTERNAL_SERVER_ERROR'), 'Database not configured'); return null; }
  return db;
}

// ─── Routes ──────────────────────────────────────────

// POST /auth/token — rotate refresh token
router.post('/token', async (req, res) => {
  const raw = (req.body && req.body.refresh_token) || (req.cookies && req.cookies.refresh_token);
  const db = getDb(req, res);
  if (!db) return;
  try {
    const result = await flows.refreshToken(db, raw);
    if (!result.ok) return res.sendError(RC(result.code), result.message);
    setRefreshCookie(res, result.refreshToken);
    return res.sendSuccess({ access_token: result.accessToken, token_type: 'bearer', expires_in: result.expiresIn });
  } catch (err) {
    return res.sendError(RC('INTERNAL_SERVER_ERROR'), 'Authentication failed');
  }
});

// POST /auth/logout — revoke refresh token
router.post('/logout', async (req, res) => {
  const raw = (req.body && req.body.refresh_token) || (req.cookies && req.cookies.refresh_token);
  const db = getDb(req, res);
  if (!db) return;
  try {
    const result = await flows.logout(db, raw);
    if (!result.ok) return res.sendError(RC(result.code), result.message);
    res.clearCookie('refresh_token', { path: '/api/v1/auth' });
    return res.sendSuccess({ revoked: result.revoked });
  } catch (err) {
    return res.sendError(RC('INTERNAL_SERVER_ERROR'), 'Logout failed');
  }
});

// POST /auth/register
router.post('/register', async (req, res) => {
  const db = getDb(req, res);
  if (!db) return;
  try {
    const result = await flows.register(db, req.body || {});
    if (!result.ok) return res.sendError(RC(result.code), result.message);
    setRefreshCookie(res, result.refreshToken);
    return res.sendSuccess({ user_id: result.userId, access_token: result.accessToken });
  } catch (err) {
    return res.sendError(RC('INTERNAL_SERVER_ERROR'), 'Registration failed');
  }
});

// POST /auth/login
router.post('/login', loginLimiter, async (req, res) => {
  const db = getDb(req, res);
  if (!db) return;
  try {
    const result = await flows.login(db, req.body || {});
    if (!result.ok) return res.sendError(RC(result.code), result.message);
    setRefreshCookie(res, result.refreshToken);
    return res.sendSuccess({ user_id: result.userId, access_token: result.accessToken });
  } catch (err) {
    return res.sendError(RC('INTERNAL_SERVER_ERROR'), 'Authentication failed');
  }
});

// POST /auth/request-password-reset
router.post('/request-password-reset', passwordResetLimiter, async (req, res) => {
  const db = getDb(req, res);
  if (!db) return;
  try {
    const result = await flows.requestPasswordReset(db, req.body || {});
    return res.sendSuccess({ requested: result.requested });
  } catch (err) {
    return res.sendSuccess({ requested: true }); // Never reveal errors
  }
});

// POST /auth/reset-password
router.post('/reset-password', async (req, res) => {
  const db = getDb(req, res);
  if (!db) return;
  try {
    const result = await flows.resetPassword(db, {
      token: req.body && req.body.token,
      newPassword: req.body && req.body.new_password,
    });
    if (!result.ok) return res.sendError(RC(result.code), result.message);
    return res.sendSuccess({ reset: result.reset });
  } catch (err) {
    return res.sendError(RC('INTERNAL_SERVER_ERROR'), 'Password reset failed');
  }
});

// POST /auth/link — link OAuth provider (authenticated)
router.post('/link', authenticate, async (req, res) => {
  const db = getDb(req, res);
  if (!db) return;
  try {
    const result = await flows.linkProvider(db, {
      userId: req.user.id,
      provider: req.body && req.body.provider,
      providerId: req.body && req.body.provider_id,
      tokenMeta: req.body && req.body.token_meta,
    });
    if (!result.ok) return res.sendError(RC(result.code), result.message);
    return res.sendSuccess({ linked: result.linked, id: result.id });
  } catch (err) {
    return res.sendError(RC('INTERNAL_SERVER_ERROR'), err.message);
  }
});

// POST /auth/unlink — unlink OAuth provider (authenticated)
router.post('/unlink', authenticate, async (req, res) => {
  const db = getDb(req, res);
  if (!db) return;
  try {
    const result = await flows.unlinkProvider(db, {
      userId: req.user.id,
      provider: req.body && req.body.provider,
    });
    if (!result.ok) return res.sendError(RC(result.code), result.message);
    return res.sendSuccess({ unlinked: result.unlinked });
  } catch (err) {
    return res.sendError(RC('INTERNAL_SERVER_ERROR'), err.message);
  }
});

// POST /auth/_create_refresh — dev/test helper
router.post('/_create_refresh', async (req, res) => {
  const db = getDb(req, res);
  if (!db) return;
  try {
    const { user_id } = req.body || {};
    if (!user_id) return res.sendError(RC('BAD_REQUEST'), 'Missing user_id');
    const raw = rtCreateRaw();
    const tokenHash = rtHash(raw);
    const ttl = process.env.REFRESH_TOKEN_TTL_MS ? parseInt(process.env.REFRESH_TOKEN_TTL_MS, 10) : 30 * 24 * 60 * 60 * 1000;
    const expiresAt = new Date(Date.now() + ttl);
    const row = await refreshTokenStore.storeRefreshToken(db, { userId: user_id, tokenHash, expiresAt });
    return res.sendSuccess({ refresh_token: raw, id: row.id, expires_at: row.expires_at });
  } catch (err) {
    return res.sendError(RC('INTERNAL_SERVER_ERROR'), err.message);
  }
});

// GET /auth/me — current user profile
router.get('/me', async (req, res) => {
  const db = getDb(req, res);
  if (!db) return;
  try {
    const auth = (req.headers.authorization || '').toString();
    const accessToken = auth.startsWith('Bearer ') ? auth.slice(7).trim() : null;
    const refreshTokenRaw = req.cookies && req.cookies.refresh_token;
    const result = await flows.getCurrentUser(db, { accessToken, refreshTokenRaw });
    if (!result.ok) return res.sendError(RC(result.code), result.message);
    return res.sendSuccess({ user: result.user });
  } catch (err) {
    return res.sendError(RC('INTERNAL_SERVER_ERROR'), err.message);
  }
});

// GET /auth/:provider — redirect to OAuth provider
router.get('/:provider', (req, res) => {
  try {
    const url = getProviderRedirect(req.params.provider);
    res.redirect(url);
  } catch (err) {
    res.sendError(RC('BAD_REQUEST'), err.message);
  }
});

// POST /auth/oauth/callback
router.post('/oauth/callback', async (req, res) => {
  const db = getDb(req, res);
  if (!db) return;
  try {
    const result = await flows.oauthCallback(db, {
      provider: req.body && req.body.provider,
      code: req.body && req.body.code,
      codeVerifier: req.body && req.body.code_verifier,
      redirectUri: req.body && req.body.redirect_uri,
    });
    if (!result.ok) return res.sendError(RC(result.code), result.message);
    setRefreshCookie(res, result.refreshToken);
    return res.sendSuccess({ user_id: result.userId, access_token: result.accessToken });
  } catch (err) {
    return res.sendError(RC('INTERNAL_SERVER_ERROR'), 'OAuth callback failed');
  }
});

// POST /auth/validate — JWT validation for remote services
router.post('/validate', (req, res) => {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  const result = flows.validateAccessToken(token);
  if (!result.ok) return res.sendError(RC(result.code), result.message);
  return res.sendSuccess({ user: result.user });
});

module.exports = router;
