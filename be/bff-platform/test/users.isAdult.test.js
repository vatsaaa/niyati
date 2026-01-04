const request = require('supertest');
const { createTestApp, createMockDb } = require('@test-helpers');

describe('users is_adult behavior', () => {
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
    const { app: testApp } = createTestApp('/api/v1/users', router);
    app = testApp;
  });

  afterEach(() => jest.restoreAllMocks());

  test('POST /profile computes and returns is_adult=true for adult DOB', async () => {
    const fakeDb = createMockDb(async (sql, params) => {
      if (sql.trim().toUpperCase().startsWith('INSERT INTO USERS')) {
        return { rows: [{ id: 'uuid-1', phone_number: params[0], is_adult: true }], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    });
    app.set('db', fakeDb);

    const res = await request(app).post('/api/v1/users/profile').send({ phoneNumber: '+911234', dateOfBirth: '1990-01-01' });
    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.data.user).toHaveProperty('is_adult', true);
  });

  test('POST /identify returns is_adult when stored in DB', async () => {
    const sampleUser = {
      id: 7,
      phone_number: '+91-8888888888',
      name: 'Return User',
      date_of_birth: '1990-01-01',
      consent_given: true,
      credits: 3,
      credits_last_reset: null,
      total_paid_amount: 0,
      last_login_location: 'Mumbai',
      is_adult: true
    };
    const fakeDb = createMockDb({ rows: [sampleUser], rowCount: 1 });
    app.set('db', fakeDb);
    const res = await request(app).post('/api/v1/users/identify').send({ phoneNumber: '+91-8888888888' });
    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.data.returning).toBe(true);
    expect(res.body.data.user).toHaveProperty('is_adult', true);
  });
});
