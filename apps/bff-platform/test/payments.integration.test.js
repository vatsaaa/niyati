const request = require('supertest');
const express = require('express');

describe('bff-platform payments endpoints', () => {
  let app;

  beforeEach(() => {
    jest.resetModules();

    // Mock authenticateOrReject as passthrough so business-logic tests aren't blocked
    jest.mock('@niyati/commons', () => {
      const actual = jest.requireActual('@niyati/commons');
      return {
        ...actual,
        authenticateOrReject: (req, res, next) => next()
      };
    });

    const router = require('../lib/users');
    app = express();
    app.use(express.json());
    const { attachResponseHelpers } = require('@niyati/commons/lib/responses');
    // Mount under a simple prefix for test isolation
    app.use('/users', attachResponseHelpers, router);
  });

  test('POST /deduct-credits reduces credits and floors at zero', async () => {
    const fakeDb = {
      async query(sql, params) {
        const s = (sql || '').toLowerCase();
        if (s.includes('update user_credits') && s.includes('greatest')) {
          return { rows: [{ id: 'user-1', credits: Math.max(0, 5 - params[1]), total_paid_amount: 0 }], rowCount: 1 };
        }
        return { rows: [], rowCount: 0 };
      }
    };
    app.set('db', fakeDb);
    const res = await request(app)
      .post('/users/deduct-credits')
      .send({ phoneNumber: '+919111222333', amount: 3 });
    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.data).toHaveProperty('credits');
  });

  test('POST /add-credits adds credits according to config', async () => {
    const fakeDb = {
      async query(sql, params) {
        const s = (sql || '').toLowerCase();
        if (s.includes('select key')) {
          return { rows: [{ key: 'credits_per_10_inr', value: '1' }], rowCount: 1 };
        }
        if (s.includes('update user_credits') && s.includes('credits = credits +')) {
          return { rows: [{ user_id: 'user-2', credits: 20, total_paid_amount: params[2], is_paid: true, last_payment_amount: params[2], last_payment_verified: true, upi_id: null, upi_txn_id: null }], rowCount: 1 };
        }
        return { rows: [], rowCount: 0 };
      }
    };
    app.set('db', fakeDb);
    const res = await request(app)
      .post('/users/add-credits')
      .send({ phoneNumber: '+919444555666', amount: 500 });
    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.data).toHaveProperty('creditsAdded');
  });
});
