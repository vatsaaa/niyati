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
});
