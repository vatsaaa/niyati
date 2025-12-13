const request = require('supertest');
const express = require('express');
const jwt = require('jsonwebtoken');
const authRouter = require('../../lib/auth');
const commons = require('../../commons');

describe('bff-auth - integration /auth/me', () => {
  let app;
  let mockDb;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use(require('cookie-parser')());
    app.use(commons.attachResponseHelpers);
    app.set('db', null); // will set per-test
    app.use('/auth', authRouter);

    // simple mock DB implementation we'll swap per-test
    mockDb = {
      query: jest.fn(async (sql, params) => {
        // If selecting user by id
        if (sql && sql.toString().toLowerCase().includes('select id, email, name')) {
          const id = params && params[0];
          return { rowCount: 1, rows: [{ id, email: 'test@example.com', name: 'Test User' }] };
        }
        return { rowCount: 0, rows: [] };
      })
    };
  });

  test('GET /auth/me with valid bearer token returns user', async () => {
    process.env.ACCESS_TOKEN_SECRET = 'test-secret';
    const payload = { sub: 42 };
    const token = jwt.sign(payload, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '1h', issuer: 'niyati-bff', audience: 'niyati-app' });

    app.set('db', mockDb);

    const res = await request(app).get('/auth/me').set('Authorization', `Bearer ${token}`).send();
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.data).toHaveProperty('user');
    expect(res.body.data.user).toMatchObject({ id: 42, email: 'test@example.com', name: 'Test User' });
  });

  test('GET /auth/me without token returns UNAUTHORIZED', async () => {
    app.set('db', mockDb);
    const res = await request(app).get('/auth/me').send();
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe(commons.ErrorCodes.UNAUTHORIZED);
  });

  test('GET /auth/me with valid refresh_token cookie return user', async () => {
    app.set('db', mockDb);
    const secret = 'test-secret'; // unused for cookie check but needed if we mocked jwt verify?
    // Actually /me checks cookie hash against DB.
    // We need to mock findRefreshTokenByHash.
    // But internal implementation of /me queries DB for refresh token path.

    // Mock DB for refresh token lookup
    const originalMock = mockDb.query;
    mockDb.query = jest.fn(async (sql, params) => {
      if (sql.includes('FROM refresh_tokens WHERE token_hash')) {
        return { rowCount: 1, rows: [{ user_id: 42, revoked: false, expires_at: new Date(Date.now() + 10000) }] };
      }
      if (sql.includes('SELECT id, email, name')) {
        return { rowCount: 1, rows: [{ id: 42, email: 'cookie@example.com', name: 'Cookie User' }] };
      }
      return { rowCount: 0, rows: [] };
    });

    const res = await request(app).get('/auth/me')
      .set('Cookie', ['refresh_token=validtoken'])
      .send();

    mockDb.query = originalMock; // restore

    expect(res.status).toBe(200);
    expect(res.body.data.user.email).toBe('cookie@example.com');
  });
});
