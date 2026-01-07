const request = require('supertest');
const { createTestApp } = require('@test-helpers');

describe('bff-auth forwarding last_login_location', () => {
  let app;

  beforeEach(() => {
    jest.resetModules();
    jest.mock('@niyati/commons/lib/logger', () => ({ logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn(), fatal: jest.fn(), trace: jest.fn(),  error: jest.fn(), info: jest.fn() } }));
    const axios = require('axios');
    jest.mock('axios');

    const usersRouter = require('../lib/users');
    const { app: testApp } = createTestApp('/api/v1/users', usersRouter);
    app = testApp;
  });

  afterEach(() => jest.restoreAllMocks());

  test('POST /profile forwards last_login_location to bff-platform', async () => {
    const axios = require('axios');
    // lookup returns no user
    axios.get = jest.fn().mockResolvedValue({ data: { status: 'ok', data: null } });
    // sync returns created user with last_login_location
    axios.post = jest.fn().mockResolvedValue({ data: { status: 'ok', data: { user: { id: 10, last_login_location: 'Chennai' } } } });

    const res = await request(app)
      .post('/api/v1/users/profile')
      .send({ phoneNumber: '+919800000000', consentGiven: true, last_login_location: 'Chennai' });

    expect(axios.get).toHaveBeenCalled();
    expect(axios.post).toHaveBeenCalled();
    // ensure payload included last_login_location
    const payload = axios.post.mock.calls[0][1];
    expect(payload).toHaveProperty('last_login_location', 'Chennai');

    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.data).toHaveProperty('user');
    expect(res.body.data.user).toHaveProperty('last_login_location', 'Chennai');
  });
});
