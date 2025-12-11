const request = require('supertest');
const express = require('express');
const authRouter = require('../../lib/auth');
const commons = require('../../commons');

describe('bff-auth - validation/unit tests', () => {
  let app;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use(commons.attachResponseHelpers);
    app.use('/auth', authRouter);
  });

  test('POST /auth/login with invalid email returns UNAUTHORIZED', async () => {
    const res = await request(app).post('/auth/login').send({ email: 'not-an-email', password: 'password123' });
    expect(res.status).toBe(401);
    expect(res.body).toHaveProperty('error');
    expect(res.body.error.code).toBe(commons.ErrorCodes.UNAUTHORIZED);
  });

  test('POST /auth/register with short password returns VALIDATION_ERROR', async () => {
    const payload = { email: 'user@example.com', password: 'short', name: 'Alice' };
    const res = await request(app).post('/auth/register').send(payload);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe(commons.ErrorCodes.VALIDATION_ERROR);
  });

  test('POST /auth/request-password-reset with invalid email returns success', async () => {
    const res = await request(app).post('/auth/request-password-reset').send({ email: 'not-an-email' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.data).toEqual({ requested: true });
  });
});
