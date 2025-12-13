const request = require('supertest');
const express = require('express');
const commons = require('../../../commons');
const axios = require('axios');

jest.mock('axios');

describe('bff-auth - profile sync', () => {
  let app;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use(commons.attachResponseHelpers);
    const usersRouter = require('../../lib/users');
    app.use('/api/users', usersRouter);
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  test('POST /api/users/profile skips sync when user exists', async () => {
    const existingUser = { id: '1', phone_number: '+91-9999999999' };
    axios.get.mockResolvedValueOnce({ data: { status: 'ok', data: { user: existingUser } } });
    const onSync = jest.fn();
    axios.post.mockImplementation(onSync);

    const payload = { phoneNumber: '+91-9999999999', consentGiven: true };
    const res = await request(app).post('/api/users/profile').send(payload);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.data.created).toBe(false);
    expect(axios.post).not.toHaveBeenCalled();
  });

  test('POST /api/users/profile calls sync when user does not exist', async () => {
    axios.get.mockResolvedValueOnce({ data: { status: 'ok', data: null } });
    axios.post.mockResolvedValueOnce({ data: { status: 'ok', data: { user: { id: '2', phone_number: '+91-8888888888' } } } });

    const payload = { phoneNumber: '+91-8888888888', consentGiven: true };
    const res = await request(app).post('/api/users/profile').send(payload);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.data.created).toBe(true);
    expect(res.body.data.user).toHaveProperty('phone_number', '+91-8888888888');
  });
});
