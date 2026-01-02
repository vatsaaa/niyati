const request = require('supertest');
const { createTestApp, createMockDb } = require('@test-helpers');

describe('POST /can-ask', () => {
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

  test('free user with sufficient credits can ask today question', async () => {
    const fakeDb = {
      async query(sql, params) {
        // intercept getAppConfig SELECT
        if (sql && sql.toUpperCase().startsWith('SELECT KEY')) return { rows: [], rowCount: 0 };
        // select user credits
        if (sql && sql.toUpperCase().includes('SELECT CREDITS')) {
          return { rows: [{ credits: 15, is_paid: false }], rowCount: 1 };
        }
        return { rows: [], rowCount: 0 };
      }
    };

    app.set('db', fakeDb);

    const res = await request(app).post('/api/v1/users/can-ask').send({ phoneNumber: '+91111', question: 'How is my day today?' });
    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.data.allowed).toBe(true);
    expect(res.body.data.cost).toBe(2);
  });

  test('free user with low credits cannot ask future question', async () => {
    const fakeDb = {
      async query(sql, params) {
        if (sql && sql.toUpperCase().startsWith('SELECT KEY')) return { rows: [], rowCount: 0 };
        if (sql && sql.toUpperCase().includes('SELECT CREDITS')) {
          return { rows: [{ credits: 8, is_paid: false }], rowCount: 1 };
        }
        return { rows: [], rowCount: 0 };
      }
    };
    app.set('db', fakeDb);

    const res = await request(app).post('/api/v1/users/can-ask').send({ phoneNumber: '+91222', question: 'How will my career be next 6 months?' });
    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.data.allowed).toBe(false);
    expect(res.body.data.reason).toBe('low_credits_restricts_future');
  });

  test('paid user can ask future question if has credits', async () => {
    const fakeDb = {
      async query(sql, params) {
        if (sql && sql.toUpperCase().startsWith('SELECT KEY')) return { rows: [], rowCount: 0 };
        if (sql && sql.toUpperCase().includes('SELECT CREDITS')) {
          return { rows: [{ credits: 20, is_paid: true }], rowCount: 1 };
        }
        return { rows: [], rowCount: 0 };
      }
    };
    app.set('db', fakeDb);

    const res = await request(app).post('/api/v1/users/can-ask').send({ phoneNumber: '+91333', question: 'When will I get married?' });
    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.data.allowed).toBe(true);
    expect(res.body.data.cost).toBe(4);
  });

  test('user with insufficient credits is blocked', async () => {
    const fakeDb = {
      async query(sql, params) {
        if (sql && sql.toUpperCase().startsWith('SELECT KEY')) return { rows: [], rowCount: 0 };
        if (sql && sql.toUpperCase().includes('SELECT CREDITS')) {
          return { rows: [{ credits: 1, is_paid: false }], rowCount: 1 };
        }
        return { rows: [], rowCount: 0 };
      }
    };
    app.set('db', fakeDb);

    const res = await request(app).post('/api/v1/users/can-ask').send({ phoneNumber: '+91444', question: 'How is my day today?' });
    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.data.allowed).toBe(false);
    expect(res.body.data.reason).toBe('insufficient_credits');
  });
});
