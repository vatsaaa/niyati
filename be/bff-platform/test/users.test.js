const request = require('supertest');
const express = require('express');

describe('bff-platform users routes', () => {
  let app;

  beforeEach(() => {
    jest.resetModules();

    jest.mock('../commons', () => {
      const responses = require('../../commons/lib/responses');
      return {
        logger: { warn: jest.fn(), error: jest.fn() },
        sanitize: v => v,
        ErrorCodes: responses.ErrorCodes,
        config: {}
      };
    });

    const router = require('../lib/users');
    app = express();
    app.use(express.json());
    const { attachResponseHelpers } = require('../../commons/lib/responses');
    app.use('/api/v1/users', attachResponseHelpers, router);
  });

  afterEach(() => jest.restoreAllMocks());

  test('POST /sync returns 200 for valid profile', async () => {
    const fakeDb = { async query(sql, params) { return { rows: [{ id: 1, phone_number: params[0] }], rowCount: 1 }; } };
    app.set('db', fakeDb);
    const res = await request(app).post('/api/v1/users/sync').set('X-Service-Token', process.env.SERVICE_TOKEN || '').send({ phoneNumber: '+1234', consentGiven: true });
    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe('ok');
  });

  test('POST /identify returns returning false when not found', async () => {
    const fakeDb = { async query(sql, params) { return { rows: [], rowCount: 0 }; } };
    app.set('db', fakeDb);
    const res = await request(app).post('/api/v1/users/identify').send({ phoneNumber: '+1234' });
    expect(res.statusCode).toBe(200);
    expect(res.body.data.returning).toBe(false);
  });

  test('POST /sync creates a new user with default credits and returns user object', async () => {
    const fakeDb = {
      async query(sql, params) {
        // Simulate INSERT ... RETURNING behavior
        if (sql.trim().toUpperCase().startsWith('INSERT INTO USERS')) {
          return { rows: [{ id: 99, phone_number: params[0], credits: 10 }], rowCount: 1 };
        }
        return { rows: [], rowCount: 0 };
      }
    };
    app.set('db', fakeDb);
    const res = await request(app).post('/api/v1/users/sync').set('X-Service-Token', process.env.SERVICE_TOKEN || '').send({ phoneNumber: '+919999999999', consentGiven: true });
    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.data).toHaveProperty('user');
    expect(res.body.data.user).toHaveProperty('id', 99);
    expect(res.body.data.user).toHaveProperty('credits', 10);
  });

  test('POST /identify returns returning true and normalized user data for returning user', async () => {
    const sampleUser = {
      id: 7,
      phone_number: '+91-8888888888',
      name: 'Return User',
      date_of_birth: '1990-01-01',
      time_of_birth: '00:00:00',
      place_of_birth: 'Delhi',
      consent_given: true,
      credits: 3,
      credits_last_reset: null,
      total_paid_amount: 0,
      last_login_location: 'Mumbai'
    };
    const fakeDb = { async query(sql, params) { return { rows: [sampleUser], rowCount: 1 }; } };
    app.set('db', fakeDb);
    const res = await request(app).post('/api/v1/users/identify').send({ phoneNumber: '+91-8888888888' });
    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.data.returning).toBe(true);
    expect(res.body.data.user).toHaveProperty('id', 7);
    expect(res.body.data.user).toHaveProperty('phone_number');
    expect(res.body.data.user).toHaveProperty('credits');
  });
});
