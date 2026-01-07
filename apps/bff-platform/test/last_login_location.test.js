const request = require('supertest');
const { createTestApp, createMockDb } = require('@test-helpers');

describe('bff-platform users last_login_location persistence', () => {
  let app;

  beforeEach(() => {
    jest.resetModules();

    jest.mock('@niyati/commons', () => {
      const responses = require('@niyati/commons/lib/responses');
      return {
        logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn(), fatal: jest.fn(), trace: jest.fn(),  warn: jest.fn(), error: jest.fn() },
        sanitize: v => v,
        ErrorCodes: responses.ErrorCodes,
        config: {}, dateUtils: { computeIsAdult: jest.fn(() => true) },
        dateUtils: { computeIsAdult: jest.fn(() => true) }
      };
    });

    const router = require('../lib/users');
    const { app: testApp } = createTestApp('/api/v1/users', router);
    app = testApp;
  });

  afterEach(() => jest.restoreAllMocks());

  test('POST /profile saves and returns last_login_location', async () => {
    const providedPhone = '+919700000000';
    const providedLastLoc = 'Bengaluru';

    const fakeDb = createMockDb(async (sql, params) => {
      // last_login_location is expected at params[11]
      expect(params[11]).toBe(providedLastLoc);
      return { rows: [{ id: 42, phone_number: params[0], last_login_location: params[11] }], rowCount: 1 };
    });

    app.set('db', fakeDb);

    const res = await request(app)
      .post('/api/v1/users/profile')
      .send({ phoneNumber: providedPhone, consentGiven: true, last_login_location: providedLastLoc });

    if (res.statusCode !== 200) console.error('TEST FAIL BODY:', JSON.stringify(res.body, null, 2));
    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.data).toHaveProperty('user');
    expect(res.body.data.user).toHaveProperty('last_login_location', providedLastLoc);
  });
});
