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
});
