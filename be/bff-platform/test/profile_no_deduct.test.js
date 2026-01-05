const request = require('supertest');
const { createTestApp, createMockDb } = require('@test-helpers');

describe('profile update does not deduct credits', () => {
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

  test('POST /profile preserves existing credits (no deduction)', async () => {
    const existingCredits = 5;
    const fakeDb = createMockDb(async (sql, params) => {
      // Simulate INSERT ... RETURNING behavior: return existing credits unchanged
      if (sql.trim().toUpperCase().startsWith('INSERT INTO USERS')) {
        return { rows: [{ id: 42, phone_number: params[0], credits: existingCredits }], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    });
    app.set('db', fakeDb);

    const res = await request(app).post('/api/v1/users/profile').send({ phoneNumber: '+919999999999', name: 'Test User' });
    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.data.user).toHaveProperty('credits', existingCredits);
  });
});
