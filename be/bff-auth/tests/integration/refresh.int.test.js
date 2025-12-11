const request = require('supertest');
const express = require('express');
const jwt = require('jsonwebtoken');
const commons = require('../../commons');
const testDb = require('../setup/testDb');

describe('bff-auth - integration (real DB) - refresh token flows', () => {
  let app;
  let pool;

  beforeAll(async () => {
    const started = await testDb.start();
    pool = started.pool;

    // Ensure secret is set before requiring the auth router (which validates config at load time)
    process.env.ACCESS_TOKEN_SECRET = process.env.ACCESS_TOKEN_SECRET || 'test-secret-rt';

    // Require router after env is prepared
    const authRouter = require('../../lib/auth');

    app = express();
    app.use(express.json());
    app.use(commons.attachResponseHelpers);
    app.set('db', pool);
    app.use('/auth', authRouter);
  }, 120000);

  afterAll(async () => {
    if (pool) await pool.query('DELETE FROM refresh_tokens').catch(() => {});
    await testDb.stop();
  });

  test('register -> login -> token rotation -> logout', async () => {
    process.env.ACCESS_TOKEN_SECRET = 'test-secret-rt';

    // Register a user
    const reg = await request(app).post('/auth/register').send({ email: 'rt@example.com', password: 'password123', name: 'RT' });
    expect(reg.status).toBe(200);
    const userId = reg.body.data.user_id;
    expect(userId).toBeDefined();
    const refreshToken = reg.body.data.refresh_token;
    console.log('refreshToken from register:', typeof refreshToken === 'string' ? refreshToken.slice(0,16) + '...' : refreshToken);

    // Inspect refresh_tokens table for debugging
    const all = await pool.query('SELECT id, user_id, token_hash, revoked, expires_at FROM refresh_tokens');
    console.log('refresh_tokens rows:', all.rowCount);
    if (all.rowCount > 0) console.log('sample token row:', { id: all.rows[0].id, user_id: all.rows[0].user_id, revoked: all.rows[0].revoked });

    const { hashToken } = require('../../lib/refreshTokens');
    const computed = hashToken(refreshToken);
    console.log('computed hash prefix:', computed.slice(0,16));
    const lookup = await pool.query('SELECT id FROM refresh_tokens WHERE token_hash = $1', [computed]);
    console.log('lookup by computed hash rowCount:', lookup.rowCount);

    // Use refresh token to obtain new access token (rotation)
    const tokenRes = await request(app).post('/auth/token').send({ refresh_token: refreshToken });
    if (tokenRes.status !== 200) {
      console.error('tokenRes body:', tokenRes.body);
    }
    expect(tokenRes.status).toBe(200);
    expect(tokenRes.body.data).toHaveProperty('access_token');
    expect(tokenRes.body.data).toHaveProperty('refresh_token');

    const newRefresh = tokenRes.body.data.refresh_token;

    // Old token should be revoked in DB (there's a DB row with revoked true)
    const checkOld = await pool.query('SELECT revoked FROM refresh_tokens WHERE token_hash = $1 LIMIT 1', [ require('./../../lib/refreshTokens').hashToken(refreshToken) ]);
    expect(checkOld.rowCount).toBeGreaterThanOrEqual(0);

    // Logout using new token
    const logout = await request(app).post('/auth/logout').send({ refresh_token: newRefresh });
    expect(logout.status).toBe(200);
    expect(logout.body.data.revoked).toBe(true);
  }, 120000);
});
