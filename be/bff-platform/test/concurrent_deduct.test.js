const request = require('supertest');
const express = require('express');

describe('concurrent deduct-credits behavior', () => {
  let app;

  beforeEach(() => {
    jest.resetModules();
    // mount router the same way as other tests
    const router = require('../lib/users');
    app = express();
    app.use(express.json());
    const { attachResponseHelpers } = require('../../commons/lib/responses');
    app.use('/api/v1/users', attachResponseHelpers, router);
  });

  test('multiple parallel deductions result in credits floored at zero', async () => {
    // shared in-memory credits to simulate DB updates
    let credits = 10;
    const fakeDb = {
      async query(sql, params) {
        const usql = sql.trim().toUpperCase();
        if (usql.startsWith('UPDATE USERS')) {
          const amt = params[1];
          // simulate atomic update: subtract and floor at 0
          credits = Math.max(0, credits - amt);
          return { rows: [{ id: 1, credits, total_paid_amount: 0 }], rowCount: 1 };
        }
        return { rows: [], rowCount: 0 };
      }
    };

    app.set('db', fakeDb);

    const parallel = [];
    const numRequests = 8; // 8 * 2 = 16 > 10
    for (let i = 0; i < numRequests; i++) {
      parallel.push(request(app)
        .post('/api/v1/users/deduct-credits')
        .send({ phoneNumber: '+919999999999', amount: 2 }));
    }

    const results = await Promise.all(parallel);
    results.forEach(r => expect([200, 404]).toContain(r.statusCode));
    expect(credits).toBe(0);
  }, 20000);
});
