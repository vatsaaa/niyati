const request = require('supertest');
const { createTestApp } = require('@test-helpers');

describe('users routes', () => {
  let app;

  beforeEach(() => {
    jest.resetModules();
    process.env.ACCESS_TOKEN_SECRET = 'testsecret';
    // Use real response helpers; mock logger only
    jest.mock('@niyati/commons/lib/logger', () => ({ logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn(), fatal: jest.fn(), trace: jest.fn(),  error: jest.fn(), info: jest.fn() } }));

    // mock axios
    const axios = require('axios');
    jest.mock('axios');

    const usersRouter = require('../lib/users');
    const { app: testApp } = createTestApp('/api/v1/users', usersRouter);
    app = testApp;
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

  test('POST /profile creates auth users row for new phone-based user', async () => {
    const axios = require('axios');
    // Platform lookup returns no user (new user)
    axios.get = jest.fn().mockResolvedValue({ data: { status: 'ok', data: { user: null } } });
    // Platform sync succeeds
    axios.post = jest.fn().mockResolvedValue({ data: { status: 'ok', data: { user: { user_id: 'uuid-1', phone_number: '+919000000001', credits: 10 } } } });

    // Mock db.query to capture INSERT INTO users
    const queryCalls = [];
    const mockDb = { query: jest.fn(async (sql, params) => {
      queryCalls.push({ sql, params });
      if (sql.includes('INSERT INTO users')) {
        return { rows: [{ id: 'auth-uuid-1', phone_number: '+919000000001', name: 'Test User' }], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    }) };
    app.set('db', mockDb);

    const res = await request(app).post('/api/v1/users/profile').send({
      phoneNumber: '+919000000001',
      name: 'Test User',
      dateOfBirth: '1990-01-01',
      timeOfBirth: '09:00',
      placeOfBirth: 'Delhi',
      consentGiven: true
    });

    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.data.created).toBe(true);

    // Verify that INSERT INTO users was called
    const insertCall = queryCalls.find(c => c.sql.includes('INSERT INTO users'));
    expect(insertCall).toBeDefined();
    expect(insertCall.params).toContain('+919000000001');
  });

  test('POST /identify returns returning false when lookup returns no user', async () => {
    const axios = require('axios');
    axios.get = jest.fn().mockResolvedValue({ data: { status: 'ok', data: null } });

    const res = await request(app).post('/api/v1/users/identify').send({ phoneNumber: '+12345678' });
    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.data).toHaveProperty('returning', false);
    expect(res.body.data).toHaveProperty('access_token');
  });

  // --- access_token issuance on identify ---

  test('POST /identify returns access_token for returning user', async () => {
    process.env.ACCESS_TOKEN_SECRET = 'testsecret';
    const axios = require('axios');
    axios.get = jest.fn().mockResolvedValue({
      data: { status: 'ok', data: { user: { id: 'uuid-7', phone_number: '+919876543210', name: 'Returning User', credits: 8 } } }
    });

    const res = await request(app).post('/api/v1/users/identify').send({ phoneNumber: '+919876543210' });
    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.data).toHaveProperty('returning', true);
    expect(res.body.data).toHaveProperty('access_token');
    expect(typeof res.body.data.access_token).toBe('string');
    expect(res.body.data.access_token.length).toBeGreaterThan(10);
    // Token should be a valid JWT (3 dot-separated parts)
    expect(res.body.data.access_token.split('.')).toHaveLength(3);
  });

  test('POST /identify returns access_token for new user', async () => {
    process.env.ACCESS_TOKEN_SECRET = 'testsecret';
    const axios = require('axios');
    axios.get = jest.fn().mockResolvedValue({ data: { status: 'ok', data: null } });

    const res = await request(app).post('/api/v1/users/identify').send({ phoneNumber: '+919876543211' });
    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.data).toHaveProperty('returning', false);
    expect(res.body.data).toHaveProperty('access_token');
    expect(typeof res.body.data.access_token).toBe('string');
    expect(res.body.data.access_token.split('.')).toHaveLength(3);
  });
});
