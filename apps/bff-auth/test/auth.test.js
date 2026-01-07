const request = require('supertest');
const express = require('express');
const bcrypt = require('bcryptjs');

describe('auth routes', () => {
  let app;

  beforeEach(() => {
    jest.resetModules();
    process.env.ACCESS_TOKEN_SECRET = 'testsecret';
    process.env.BCRYPT_ROUNDS = '1';

    // Use real response helpers from be/commons; mock logger only
    jest.mock('@niyati/commons/lib/logger', () => ({ logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn(), fatal: jest.fn(), trace: jest.fn(),  error: jest.fn(), info: jest.fn() } }));

    // Mock refreshTokens to avoid DB writes for refresh tokens
    jest.mock('../lib/refreshTokens', () => ({
      createRawToken: () => 'rawtoken',
      hashToken: () => 'tokenhash',
      storeRefreshToken: async () => ({ id: 1, expires_at: new Date() }),
      findRefreshTokenByHash: async () => null,
      rotateRefreshToken: async () => ({ id: 2, expires_at: new Date() }),
      revokeRefreshToken: async () => true
    }));

    const authRouter = require('../lib/auth');

    app = express();
    app.use(express.json());
    // attach response helpers before router
    const { attachResponseHelpers } = require('@niyati/commons/lib/responses');
    app.use('/api/v1/auth', attachResponseHelpers, authRouter);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('POST /register succeeds for new user', async () => {
    // fake DB that reports no existing user and returns inserted id
    const fakeDb = {
      async query(sql, params) {
        if (sql.startsWith('SELECT id FROM users')) return { rowCount: 0, rows: [] };
        if (sql.startsWith('INSERT INTO users')) return { rowCount: 1, rows: [{ id: 42 }] };
        return { rowCount: 1, rows: [] };
      }
    };
    app.set('db', fakeDb);

    const res = await request(app).post('/api/v1/auth/register').send({ email: 'a@b.com', password: 'strongpass', name: 'Test' });
    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.data).toHaveProperty('user_id', 42);
    expect(res.body.data).toHaveProperty('access_token');
  });

  test('POST /register conflicts when email exists', async () => {
    const fakeDb = {
      async query(sql, params) {
        if (sql.startsWith('SELECT id FROM users')) return { rowCount: 1, rows: [{ id: 1 }] };
        return { rowCount: 0, rows: [] };
      }
    };
    app.set('db', fakeDb);

    const res = await request(app).post('/api/v1/auth/register').send({ email: 'exists@b.com', password: 'strongpass' });
    expect(res.statusCode).toBe(409);
    expect(res.body.status).toBe('error');
  });

  test('POST /login succeeds with valid credentials', async () => {
    const passwordHash = bcrypt.hashSync('mypassword', 1);
    const fakeDb = {
      async query(sql, params) {
        if (sql.startsWith('SELECT id, password_hash FROM users')) return { rowCount: 1, rows: [{ id: 7, password_hash: passwordHash }] };
        if (sql.startsWith('INSERT INTO refresh_tokens')) return { rows: [{ id: 9 }], rowCount: 1 };
        return { rowCount: 0, rows: [] };
      }
    };
    app.set('db', fakeDb);

    const res = await request(app).post('/api/v1/auth/login').send({ email: 'user@a.com', password: 'mypassword' });
    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.data).toHaveProperty('user_id', 7);
    expect(res.body.data).toHaveProperty('access_token');
  });

  test('POST /login fails with invalid creds', async () => {
    const fakeDb = {
      async query(sql, params) {
        if (sql.startsWith('SELECT id, password_hash FROM users')) return { rowCount: 0, rows: [] };
        return { rowCount: 0, rows: [] };
      }
    };
    app.set('db', fakeDb);

    const res = await request(app).post('/api/v1/auth/login').send({ email: 'no@user', password: 'x' });
    expect(res.statusCode).toBe(401);
    expect(res.body.status).toBe('error');
  });
});
