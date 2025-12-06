const request = require('supertest');
const express = require('express');
const cookieParser = require('cookie-parser');
const path = require('path');
const nock = require('nock');
const jwt = require('jsonwebtoken');

const oauthRouter = require(path.resolve(__dirname, '../../src/routes/oauth'));
const authRouter = require(path.resolve(__dirname, '../../src/routes/auth'));
const { attachResponseHelpers } = require(path.resolve(__dirname, '../../src/lib/responses'));

// Simple in-memory fake DB to handle expected queries in this test
function makeFakeDb() {
  const refreshStore = {};
  let userIdSeq = 1;
  return {
    async query(sql, params) {
      const s = sql.toString();

      if (s.includes('SELECT user_id FROM oauth_accounts')) {
        return { rowCount: 0, rows: [] };
      }

      if (s.includes('SELECT id FROM users WHERE lower(email)')) {
        return { rowCount: 0, rows: [] };
      }

      if (s.startsWith('INSERT INTO users')) {
        const id = `user-${userIdSeq++}`;
        return { rowCount: 1, rows: [{ id }] };
      }

      if (s.startsWith('INSERT INTO oauth_accounts')) {
        return { rowCount: 1, rows: [{ id: 'oa-1' }] };
      }

      if (s.startsWith('INSERT INTO refresh_tokens')) {
        const [userId, tokenHash, expiresAt] = params;
        const id = `rt-${Date.now()}`;
        refreshStore[tokenHash] = { id, user_id: userId, token_hash: tokenHash, expires_at: expiresAt, revoked: false };
        return { rowCount: 1, rows: [{ id, expires_at: expiresAt }] };
      }

      if (s.includes('SELECT id, email, name, avatar_url')) {
        // select user
        const userId = params[0];
        // return a minimal user
        return { rowCount: 1, rows: [{ id: userId, email: 'me@example.com', name: 'Test User', avatar_url: null, created_at: new Date().toISOString(), updated_at: new Date().toISOString(), last_login: null }] };
      }

      if (s.includes('SELECT id FROM oauth_accounts')) {
        return { rowCount: 0, rows: [] };
      }

      if (s.includes('SELECT id')) {
        return { rowCount: 0, rows: [] };
      }

      if (s.includes('SELECT') && s.includes('refresh_tokens')) {
        const tokenHash = params[0];
        const row = refreshStore[tokenHash];
        if (row) return { rowCount: 1, rows: [row] };
        return { rowCount: 0, rows: [] };
      }

      // default: return empty
      return { rowCount: 0, rows: [] };
    }
  };
}

describe('OAuth integration flow (mocked provider)', () => {
  let app;
  beforeAll(() => {
    process.env.OAUTH_TEST_CLIENT_ID = 'test-client';
    process.env.OAUTH_TEST_CLIENT_SECRET = 'test-secret';
    process.env.OAUTH_TEST_TOKEN_URL = 'http://provider.test/token';
    process.env.OAUTH_TEST_USERINFO_URL = 'http://provider.test/userinfo';
    process.env.FRONTEND_BASE = 'http://localhost:5173';

    app = express();
    app.use(express.json());
    app.use(cookieParser());
    app.use(attachResponseHelpers);

    // attach fake db
    const fakeDb = makeFakeDb();
    app.set('db', fakeDb);

    app.use('/api/v1/auth', oauthRouter);
    app.use('/api/v1/auth', authRouter);
  });

  afterEach(() => {
    nock.cleanAll();
  });

  it('handles callback, sets cookies, and /auth/me returns profile', async () => {
    // Prepare nock for token exchange and userinfo
    const idToken = jwt.sign({ sub: 'prov-sub', email: 'me@example.com', name: 'Test User', picture: null }, 'irrelevant');
    nock('http://provider.test')
      .post('/token')
      .reply(200, { access_token: 'prov-access', id_token: idToken });

    nock('http://provider.test')
      .get('/userinfo')
      .reply(200, { sub: 'prov-sub', email: 'me@example.com', name: 'Test User', picture: null });

    const state = 'test-state-123';
    const verifier = 'verifier-abc';

    const callbackUrl = `/api/v1/auth/test/callback?code=code-1&state=${encodeURIComponent(state)}`;

    const res = await request(app)
      .get(callbackUrl)
      .set('Cookie', [`oauth_test_state=${state}`, `oauth_test_verifier=${verifier}`])
      .expect(302);

    expect(res.headers.location).toBe('http://localhost:5173/');
    const setCookies = res.headers['set-cookie'] || [];
    // Expect refresh_token and access_token cookies
    const refreshCookie = setCookies.find(c => c.startsWith('refresh_token='));
    const accessCookie = setCookies.find(c => c.startsWith('access_token='));
    expect(refreshCookie).toBeDefined();
    expect(accessCookie).toBeDefined();

    // Extract refresh token raw value
    const refreshRaw = refreshCookie.split(';')[0].split('=')[1];

    // Call /auth/me with refresh_token cookie
    const meRes = await request(app)
      .get('/api/v1/auth/me')
      .set('Cookie', [`refresh_token=${refreshRaw}`])
      .expect(200);

    expect(meRes.body).toHaveProperty('status', 'ok');
    expect(meRes.body.data.user).toHaveProperty('email', 'me@example.com');
  });
});
