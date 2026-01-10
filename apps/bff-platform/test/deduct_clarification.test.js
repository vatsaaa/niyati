const request = require('supertest');
const { createTestApp, createMockDb } = require('@test-helpers');

describe('POST /deduct-credits clarification guard', () => {
  let app;

  beforeEach(() => {
    jest.resetModules();
    jest.mock('@niyati/commons', () => {
      const responses = require('@niyati/commons/lib/responses');
      return {
        logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
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

  test('rejects deduction when body.isClarification is true', async () => {
    const fakeDb = createMockDb({ rows: [], rowCount: 0 });
    app.set('db', fakeDb);

    const res = await request(app)
      .post('/api/v1/users/deduct-credits')
      .send({ phoneNumber: '+911234', amount: 2, isClarification: true });

    expect(res.statusCode).toBe(400);
    expect(res.body.status).toBe('error');
    expect(res.body.error).toHaveProperty('message', 'clarification_no_deduct');
  });

  test('rejects deduction when x-needs-clarification header present', async () => {
    const fakeDb = createMockDb({ rows: [], rowCount: 0 });
    app.set('db', fakeDb);

    const res = await request(app)
      .post('/api/v1/users/deduct-credits')
      .set('x-needs-clarification', 'true')
      .send({ phoneNumber: '+919999', amount: 4 });

    expect(res.statusCode).toBe(400);
    expect(res.body.status).toBe('error');
    expect(res.body.error).toHaveProperty('message', 'clarification_no_deduct');
  });
});
