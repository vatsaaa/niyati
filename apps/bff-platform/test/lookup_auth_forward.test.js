const request = require('supertest');
const { createTestApp, createMockDb } = require('@test-helpers');

describe('users.lookup forwarding to bff-auth', () => {
  let app;
  beforeEach(() => {
    jest.resetModules();
    jest.mock('axios');
    const usersRouter = require('../lib/users');
    const { app: testApp } = createTestApp('/api/v1/users', usersRouter);
    app = testApp;
  });

  afterEach(() => jest.restoreAllMocks());

  test('GET /lookup forwards phone to bff-auth internal lookup and returns user', async () => {
    const axios = require('axios');
    axios.get = jest.fn().mockResolvedValue({ data: { status: 'ok', data: { user: { id: 'u1', phone_number: '+911234' } } } });

    const res = await request(app).get('/api/v1/users/lookup').query({ phoneNumber: '+911234' });
    expect(axios.get).toHaveBeenCalled();
    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.data.user).toHaveProperty('phone_number', '+911234');
  });

  test('POST /identify returns returning true and default credits when no credits record', async () => {
    const axios = require('axios');
    axios.get = jest.fn().mockResolvedValue({ data: { status: 'ok', data: { user: { id: 'u2', phone_number: '+919999' } } } });

    // Mock DB to return no credits row
    const mockDb = createMockDb({ rows: [], rowCount: 0 });
    const usersRouter = require('../lib/users');
    const { app: testApp } = createTestApp('/api/v1/users', usersRouter, { db: mockDb });

    const res = await request(testApp).post('/api/v1/users/identify').send({ phoneNumber: '+919999' });
    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.data.returning).toBe(true);
    expect(res.body.data.user).toHaveProperty('credits');
  });
});
