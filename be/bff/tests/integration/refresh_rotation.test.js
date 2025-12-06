const request = require('supertest');
const express = require('express');
const cookieParser = require('cookie-parser');
const path = require('path');
const { attachResponseHelpers } = require(path.resolve(__dirname, '../../src/lib/responses'));

const authRouter = require(path.resolve(__dirname, '../../src/routes/auth'));

function makeFakeDb() {
  const byId = new Map();
  const byHash = new Map();
  let userSeq = 1;

  function insertRefresh(userId, tokenHash, expiresAt) {
    const id = `rt-${Date.now()}-${Math.random().toString(36).slice(2,6)}`;
    const row = { id, user_id: userId, token_hash: tokenHash, expires_at: expiresAt, revoked: false, created_at: new Date().toISOString() };
    byId.set(id, row);
    byHash.set(tokenHash, row);
    return row;
  }

  return {
    async query(sql, params) {
      const s = sql.toString().trim();

      if (s === 'BEGIN' || s === 'COMMIT' || s === 'ROLLBACK') {
        return { rowCount: 0, rows: [] };
      }

      if (s.startsWith('INSERT INTO refresh_tokens')) {
        const [userId, tokenHash, expiresAt] = params;
        const r = insertRefresh(userId, tokenHash, expiresAt);
        return { rowCount: 1, rows: [{ id: r.id, expires_at: r.expires_at }] };
      }

      if (s.startsWith('SELECT id, user_id, token_hash, expires_at, revoked')) {
        const tokenHash = params[0];
        const row = byHash.get(tokenHash);
        if (row) return { rowCount: 1, rows: [row] };
        return { rowCount: 0, rows: [] };
      }

      if (s.startsWith('UPDATE refresh_tokens SET revoked = true WHERE id =')) {
        const id = params[0];
        const row = byId.get(id);
        if (row) {
          row.revoked = true;
          return { rowCount: 1, rows: [{ id }] };
        }
        return { rowCount: 0, rows: [] };
      }

      if (s.startsWith('SELECT id, email, name') || s.startsWith('SELECT id')) {
        // select user
        const userId = params[0];
        return { rowCount: 1, rows: [{ id: userId, email: 'me@example.com', name: 'Test User', avatar_url: null, created_at: new Date().toISOString(), updated_at: new Date().toISOString(), last_login: null }] };
      }

      if (s.startsWith('INSERT INTO users')) {
        const id = `user-${userSeq++}`;
        return { rowCount: 1, rows: [{ id }] };
      }

      if (s.startsWith('INSERT INTO oauth_accounts')) {
        return { rowCount: 1, rows: [{ id: 'oa-1' }] };
      }

      if (s.startsWith('DELETE FROM oauth_accounts')) {
        return { rowCount: 1, rows: [] };
      }

      // fallback
      return { rowCount: 0, rows: [] };
    }
  };
}

describe('Refresh token rotation, logout and reuse detection', () => {
  let app;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use(cookieParser());
    app.use(attachResponseHelpers);

    const fakeDb = makeFakeDb();
    app.set('db', fakeDb);

    app.use('/api/v1/auth', authRouter);
  });

  it('rotates refresh token and rejects reuse of old token', async () => {
    // create initial refresh token
    const createRes = await request(app)
      .post('/api/v1/auth/_create_refresh')
      .send({ user_id: 'user-1' })
      .expect(200);

    expect(createRes.body.status).toBe('ok');
    const oldRaw = createRes.body.data.refresh_token;

    // exchange old token for new pair (rotation)
    const tokenRes = await request(app)
      .post('/api/v1/auth/token')
      .send({ refresh_token: oldRaw });

    expect(tokenRes.body.status).toBe('ok');
    const newRaw = tokenRes.body.data.refresh_token;
    expect(newRaw).toBeDefined();
    expect(tokenRes.body.data.access_token).toBeDefined();

    // reuse old token should fail
    const reuseRes = await request(app)
      .post('/api/v1/auth/token')
      .send({ refresh_token: oldRaw });

    expect(reuseRes.body.status).toBe('error');
  });

  it('logout revokes refresh token and token cannot be used afterwards', async () => {
    const createRes = await request(app)
      .post('/api/v1/auth/_create_refresh')
      .send({ user_id: 'user-2' })
      .expect(200);

    const raw = createRes.body.data.refresh_token;

    // logout should revoke
    const logoutRes = await request(app)
      .post('/api/v1/auth/logout')
      .send({ refresh_token: raw })
      .expect(200);

    expect(logoutRes.body.status).toBe('ok');
    expect(logoutRes.body.data.revoked).toBe(true);

    // using the token should now fail
    const postLogoutRes = await request(app)
      .post('/api/v1/auth/token')
      .send({ refresh_token: raw });

    expect(postLogoutRes.body.status).toBe('error');
  });
});
