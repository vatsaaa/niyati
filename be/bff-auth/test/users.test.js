const request = require('supertest');
const express = require('express');

describe('users routes', () => {
  let app;

  beforeEach(() => {
    jest.resetModules();
    // Use real response helpers; mock logger only
    jest.mock('../commons/lib/logger', () => ({ logger: { error: jest.fn(), info: jest.fn() } }));

    // mock axios
    const axios = require('axios');
    jest.mock('axios');

    const usersRouter = require('../lib/users');
    app = express();
    app.use(express.json());
    const { attachResponseHelpers } = require('../../commons/lib/responses');
    app.use('/api/v1/users', attachResponseHelpers, usersRouter);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('POST /profile returns existing user when lookup finds one', async () => {
    const axios = require('axios');
    axios.get = jest.fn().mockResolvedValue({ data: { status: 'ok', data: { user: { id: 5 } } } });

    const res = await request(app).post('/api/v1/users/profile').send({ phoneNumber: '+12345678', consentGiven: true });
    expect(axios.get).toHaveBeenCalled();
    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.data).toHaveProperty('user');
    expect(res.body.data.created).toBe(false);
  });

  test('POST /identify returns returning false when lookup returns no user', async () => {
    const axios = require('axios');
    axios.get = jest.fn().mockResolvedValue({ data: { status: 'ok', data: null } });

    const res = await request(app).post('/api/v1/users/identify').send({ phoneNumber: '+12345678' });
    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.data).toEqual({ returning: false });
  });
});
