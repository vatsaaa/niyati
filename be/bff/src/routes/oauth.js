const express = require('express');
const querystring = require('querystring');
const axios = require('axios');
const jwt = require('jsonwebtoken');
const { generateCodeVerifier, generateCodeChallenge, generateState, getProviderConfig } = require('../lib/oauth');
const { createRawToken, hashToken, storeRefreshToken } = require('../lib/refreshTokens');
const { ErrorCodes } = require('../lib/responses');

const router = express.Router();

// GET /auth/:provider - start OAuth redirect (PKCE)
router.get('/:provider', (req, res) => {
  const provider = req.params.provider;
  const cfg = getProviderConfig(provider);
  if (!cfg || !cfg.clientId || !cfg.authorizeUrl) return res.sendError(ErrorCodes.BAD_REQUEST, 'Provider not configured');

  const codeVerifier = generateCodeVerifier();
  const codeChallenge = generateCodeChallenge(codeVerifier);
  const state = generateState();

  // Store verifier/state in one-time cookies (HttpOnly)
  res.cookie(`oauth_${provider}_verifier`, codeVerifier, { httpOnly: true, sameSite: 'lax' });
  res.cookie(`oauth_${provider}_state`, state, { httpOnly: true, sameSite: 'lax' });

  const params = {
    response_type: 'code',
    client_id: cfg.clientId,
    redirect_uri: process.env.OAUTH_REDIRECT_BASE ? `${process.env.OAUTH_REDIRECT_BASE}/api/${process.env.API_VERSION || 'v1'}/auth/${provider}/callback` : `${process.env.OAUTH_REDIRECT_BASE || ''}/api/v1/auth/${provider}/callback`,
    scope: cfg.scopes.join(' '),
    state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256'
  };

  const url = `${cfg.authorizeUrl}?${querystring.stringify(params)}`;
  return res.redirect(url);
});

// GET /auth/:provider/callback - exchange code for tokens and userinfo, create/link user, set session cookie, redirect to frontend
router.get('/:provider/callback', async (req, res) => {
  try {
    const provider = req.params.provider;
    const { code, state } = req.query;
    const cfg = getProviderConfig(provider);
    if (!cfg || !cfg.clientId || !cfg.clientSecret || !cfg.tokenUrl) return res.sendError(ErrorCodes.BAD_REQUEST, 'Provider not configured for callback');

    const storedState = req.cookies && req.cookies[`oauth_${provider}_state`];
    const codeVerifier = req.cookies && req.cookies[`oauth_${provider}_verifier`];
    if (!storedState || storedState !== state) return res.sendError(ErrorCodes.BAD_REQUEST, 'Invalid state');

    // Exchange code for token
    const tokenResp = await axios.post(cfg.tokenUrl, querystring.stringify({
      grant_type: 'authorization_code',
      code,
      redirect_uri: process.env.OAUTH_REDIRECT_BASE ? `${process.env.OAUTH_REDIRECT_BASE}/api/${process.env.API_VERSION || 'v1'}/auth/${provider}/callback` : `${process.env.OAUTH_REDIRECT_BASE || ''}/api/v1/auth/${provider}/callback`,
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      code_verifier: codeVerifier
    }), { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });

    const accessToken = tokenResp.data.access_token;
    const idToken = tokenResp.data.id_token;

    // Fetch userinfo if configured, otherwise try to decode id_token
    let userinfo = null;
    if (cfg.userInfoUrl && accessToken) {
      const uiResp = await axios.get(cfg.userInfoUrl, { headers: { Authorization: `Bearer ${accessToken}` } });
      userinfo = uiResp.data;
    } else if (idToken) {
      try { userinfo = jwt.decode(idToken); } catch (e) { /* ignore */ }
    }

    // Normalize provider ID and common fields
    const providerId = (userinfo && (userinfo.sub || userinfo.id || userinfo.user_id)) || tokenResp.data.user_id || null;
    const email = userinfo && (userinfo.email || (userinfo.emails && userinfo.emails[0] && userinfo.emails[0].value));
    const name = userinfo && (userinfo.name || userinfo.full_name || null);
    const avatar = userinfo && (userinfo.picture || userinfo.avatar || null);

    const db = req.app.get('db');
    if (!db) return res.sendError(ErrorCodes.INTERNAL_SERVER_ERROR, 'Database not configured');

    if (!providerId) return res.sendError(ErrorCodes.BAD_REQUEST, 'Unable to determine provider user id');

    // Try to find existing oauth account
    let userId = null;
    const oaRes = await db.query('SELECT user_id FROM oauth_accounts WHERE provider = $1 AND provider_id = $2 LIMIT 1', [provider, providerId]);
    if (oaRes.rowCount > 0) {
      userId = oaRes.rows[0].user_id;
    } else if (email) {
      // Try to find user by email and link
      const uRes = await db.query('SELECT id FROM users WHERE lower(email) = lower($1) LIMIT 1', [email]);
      if (uRes.rowCount > 0) {
        userId = uRes.rows[0].id;
        await db.query('INSERT INTO oauth_accounts (user_id, provider, provider_id, token_meta, created_at) VALUES ($1, $2, $3, $4, now())', [userId, provider, providerId, tokenResp.data]);
      }
    }

    if (!userId) {
      // Create new user
      const insertUser = await db.query('INSERT INTO users (email, name, avatar_url, created_at, updated_at) VALUES ($1, $2, $3, now(), now()) RETURNING id', [email || null, name || null, avatar || null]);
      userId = insertUser.rows[0].id;
      await db.query('INSERT INTO oauth_accounts (user_id, provider, provider_id, token_meta, created_at) VALUES ($1, $2, $3, $4, now())', [userId, provider, providerId, tokenResp.data]);
    }

    // Create refresh token and store in DB
    const rawRefresh = createRawToken();
    const refreshHash = hashToken(rawRefresh);
    const expiresAt = new Date(Date.now() + (process.env.REFRESH_TOKEN_TTL_MS ? parseInt(process.env.REFRESH_TOKEN_TTL_MS, 10) : 30 * 24 * 60 * 60 * 1000));
    await storeRefreshToken(db, { userId, tokenHash: refreshHash, expiresAt });

    // Issue access token
    const secret = process.env.ACCESS_TOKEN_SECRET || 'dev-secret';
    const accessJwt = jwt.sign({ sub: userId }, secret, { expiresIn: process.env.ACCESS_TOKEN_EXPIRES || '15m' });

    // Clear verifier/state cookies
    res.clearCookie(`oauth_${provider}_verifier`);
    res.clearCookie(`oauth_${provider}_state`);

    // Set HttpOnly refresh token cookie
    const cookieOpts = { httpOnly: true, sameSite: 'lax' };
    if (process.env.NODE_ENV === 'production') cookieOpts.secure = true;
    cookieOpts.maxAge = process.env.REFRESH_TOKEN_TTL_MS ? parseInt(process.env.REFRESH_TOKEN_TTL_MS, 10) : 30 * 24 * 60 * 60 * 1000;
    res.cookie('refresh_token', rawRefresh, cookieOpts);

    // Also set a short-lived readable access token cookie (not HttpOnly) so client JS can pick it up
    const accessCookieOpts = { httpOnly: false, sameSite: 'lax' };
    if (process.env.NODE_ENV === 'production') accessCookieOpts.secure = true;
    accessCookieOpts.maxAge = (process.env.ACCESS_TOKEN_EXPIRES_MS ? parseInt(process.env.ACCESS_TOKEN_EXPIRES_MS, 10) : 15 * 60 * 1000);
    res.cookie('access_token', accessJwt, accessCookieOpts);

    // Redirect back to frontend (no fragment)
    const frontendBase = (process.env.FRONTEND_BASE || '/').replace(/\/$/, '');
    const redirectUrl = `${frontendBase}/`;
    return res.redirect(redirectUrl);
  } catch (err) {
    return res.sendError(ErrorCodes.INTERNAL_SERVER_ERROR, err.message);
  }
});

module.exports = router;
