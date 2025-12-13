const request = require('supertest');
const express = require('express');
const commons = require('../../../commons');
const axios = require('axios');

jest.mock('axios');

describe('bff-auth - identify', () => {
  let app;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use(commons.attachResponseHelpers);
    const usersRouter = require('../../lib/users');
    app.use('/api/users', usersRouter);
  });

  test('POST /api/users/identify with invalid phone returns validation error', async () => {
    const res = await request(app).post('/api/users/identify').send({ phoneNumber: 'abc' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe(commons.ErrorCodes.VALIDATION_ERROR);
  });

  test('POST /api/users/identify returns returning:false when platform returns null', async () => {
    axios.get.mockResolvedValue({ data: { status: 'ok', data: null } });
    const res = await request(app).post('/api/users/identify').send({ phoneNumber: '+91-9999999999' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.data.returning).toBe(false);
  });

  test('POST /api/users/identify returns returning:true with user when platform returns user', async () => {
    const user = { id: '1', phone_number: '+91-9999999999' };
    axios.get.mockResolvedValue({ data: { status: 'ok', data: { user } } });
    const res = await request(app).post('/api/users/identify').send({ phoneNumber: '+91-9999999999' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.data.returning).toBe(true);
    expect(res.body.data.user).toHaveProperty('phone_number', '+91-9999999999');
  });
});
