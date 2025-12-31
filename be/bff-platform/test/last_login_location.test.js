const request = require('supertest');
const express = require('express');

describe('bff-platform users last_login_location persistence', () => {
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

  test('POST /profile saves and returns last_login_location', async () => {
    const providedPhone = '+919700000000';
    const providedLastLoc = 'Bengaluru';

    const fakeDb = {
      async query(sql, params) {
        // last_login_location is expected at params[11]
        expect(params[11]).toBe(providedLastLoc);
        return { rows: [{ id: 42, phone_number: params[0], last_login_location: params[11] }], rowCount: 1 };
      }
    };

    app.set('db', fakeDb);

    const res = await request(app)
      .post('/api/v1/users/profile')
      .send({ phoneNumber: providedPhone, consentGiven: true, last_login_location: providedLastLoc });

    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.data).toHaveProperty('user');
    expect(res.body.data.user).toHaveProperty('last_login_location', providedLastLoc);
  });
});
