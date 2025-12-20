const request = require('supertest');
const express = require('express');

describe('credits endpoints', () => {
  let app;

  beforeEach(() => {
    jest.resetModules();
    // use real responses helpers from commons; mock logger only
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

  test('POST /deduct-credits reduces credits when sufficient', async () => {
    const fakeDb = {
      async query(sql, params) {
        // Simulate update returning new credits
        if (sql.trim().toUpperCase().startsWith('UPDATE USERS')) {
          // params: [phone, amount]
          const amt = params[1];
          return { rows: [{ id: 1, credits: 5 - amt, total_paid_amount: 0 }], rowCount: 1 };
        }
        return { rows: [], rowCount: 0 };
      }
    };

    app.set('db', fakeDb);

    const res = await request(app).post('/api/v1/users/deduct-credits').send({ phoneNumber: '+911234', amount: 2 });
    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.data).toHaveProperty('credits', 3);
  });

  test('POST /deduct-credits floors at zero when insufficient credits', async () => {
    const fakeDb = {
      async query(sql, params) {
        if (sql.trim().toUpperCase().startsWith('UPDATE USERS')) {
          // simulate user had 1 credit and attempted to deduct 4 => returns 0
          return { rows: [{ id: 2, credits: 0, total_paid_amount: 0 }], rowCount: 1 };
        }
        return { rows: [], rowCount: 0 };
      }
    };

    app.set('db', fakeDb);

    const res = await request(app).post('/api/v1/users/deduct-credits').send({ phoneNumber: '+91999', amount: 4 });
    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.data).toHaveProperty('credits', 0);
  });

  test('POST /add-credits adds credits and updates total_paid_amount', async () => {
    const fakeDb = {
      async query(sql, params) {
        // getAppConfig may be called; intercept SELECT from app_config
        if (sql && sql.toUpperCase().startsWith('SELECT KEY')) {
          return { rows: [], rowCount: 0 };
        }
        if (sql.trim().toUpperCase().startsWith('UPDATE USERS')) {
          // params: [phone, creditsToAdd, amountINR]
          const creditsAdded = params[1];
          const amountINR = params[2];
          return { rows: [{ id: 3, credits: 7 + creditsAdded, total_paid_amount: amountINR }], rowCount: 1 };
        }
        return { rows: [], rowCount: 0 };
      }
    };

    app.set('db', fakeDb);

    // Add ₹500 -> floor(500/10)=50 credits (credits_per_10_inr default 1)
    const res = await request(app).post('/api/v1/users/add-credits').send({ phoneNumber: '+91988', amount: 500 });
    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.data).toHaveProperty('credits');
    expect(res.body.data).toHaveProperty('creditsAdded');
    expect(res.body.data.creditsAdded).toBe(50);
    expect(res.body.data).toHaveProperty('totalPaidAmount', 500);
  });

  test('POST /add-credits rejects small amounts (<10 INR)', async () => {
    const fakeDb = {
      async query(sql, params) {
        return { rows: [], rowCount: 0 };
      }
    };
    app.set('db', fakeDb);

    const res = await request(app).post('/api/v1/users/add-credits').send({ phoneNumber: '+91111', amount: 5 });
    expect(res.statusCode).toBe(400);
    expect(res.body.status).toBe('error');
  });
});
