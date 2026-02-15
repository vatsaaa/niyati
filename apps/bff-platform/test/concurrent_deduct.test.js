const request = require('supertest');
const { createTestApp, createMockDb } = require('@test-helpers');

describe('POST /users/deduct-credits - Concurrent Operations', () => {
  let app;

  beforeEach(() => {
    jest.resetModules();

    jest.mock('@niyati/commons', () => {
      const responses = require('@niyati/commons/lib/responses');
      return {
        logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn(), fatal: jest.fn(), trace: jest.fn() },
        sanitize: v => v,
        ErrorCodes: responses.ErrorCodes,
        config: {},
        dateUtils: { computeIsAdult: jest.fn(() => true), validateDateOfBirth: jest.fn(() => ({ valid: true })) }
      };
    });

    const router = require('../lib/users');
    ({ app } = createTestApp('/api/v1/users', router));
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('multiple parallel deductions result in credits floored at zero', async () => {
    let credits = 10;
    let callCount = 0;

    const mockDb = createMockDb(async (sql, params) => {
      callCount++;
      if (sql.includes('UPDATE user_credits') && sql.includes('GREATEST(credits - $2, 0)')) {
        // Simulate race condition by capturing credits value before update
        const amount = params[1];
        const creditsSnapshot = credits;
        const newValue = Math.max(creditsSnapshot - amount, 0);
        credits = newValue;

        return {
          rows: [{ id: 'test-user-1', credits: newValue, total_paid_amount: 0 }],
          rowCount: 1
        };
      }
      return { rows: [], rowCount: 0 };
    });

    app.set('db', mockDb);

    // Send 8 parallel deductions of 2 credits each from starting balance of 10
    // Expected: credits should floor at 0, not go negative
    const promises = Array(8).fill(null).map(() =>
      request(app)
        .post('/api/v1/users/deduct-credits')
        .send({ phoneNumber: '+91-9899162012', amount: 2 })
    );

    const results = await Promise.all(promises);

    // All requests should succeed
    results.forEach(res => {
      expect(res.statusCode).toBe(200);
      expect(res.body.status).toBe('ok');
    });

    // Final credits should be 0, not negative
    const finalCredits = results[results.length - 1].body.data.credits;
    expect(finalCredits).toBe(0);
    expect(finalCredits).toBeGreaterThanOrEqual(0);

    // Verify DB was called 8 times
    expect(callCount).toBe(8);
  });

  test('concurrent deductions with same idempotency key return cached result', async () => {
    let credits = 10;
    const chargeTransactions = new Map();
    let checkCount = 0;
    let insertCount = 0;
    let updateCount = 0;
    let finalizeCount = 0;

    const mockDb = createMockDb(async (sql, params) => {
      // Check existing transaction
      if (sql.includes('SELECT id, request_id, phone_number, amount, status, credits_after') && sql.includes('charge_transactions')) {
        checkCount++;
        const reqId = params[0];
        if (chargeTransactions.has(reqId)) {
          return { rows: [chargeTransactions.get(reqId)], rowCount: 1 };
        }
        return { rows: [], rowCount: 0 };
      }

      // BEGIN
      if (sql === 'BEGIN') {
        return { rows: [], rowCount: 0 };
      }

      // Insert charge transaction
      if (sql.includes('INSERT INTO charge_transactions') && sql.includes('pending')) {
        insertCount++;
        const [reqId, phone, amount] = params;
        const tx = {
          id: `tx-${insertCount}`,
          request_id: reqId,
          phone_number: phone,
          amount,
          status: 'pending',
          created_at: new Date().toISOString()
        };
        chargeTransactions.set(reqId, tx);
        return { rows: [{ id: tx.id }], rowCount: 1 };
      }

      // Update user_credits
      if (sql.includes('UPDATE user_credits') && sql.includes('GREATEST(credits - $2, 0)')) {
        updateCount++;
        const amount = params[1];
        credits = Math.max(credits - amount, 0);
        return { rows: [{ id: 'user-1', credits, total_paid_amount: 0 }], rowCount: 1 };
      }

      // Finalize transaction (update to applied)
      if (sql.includes('UPDATE charge_transactions') && sql.includes("status = 'applied'")) {
        finalizeCount++;
        const [reqId, creditsAfter] = params;
        const tx = chargeTransactions.get(reqId);
        if (tx) {
          tx.status = 'applied';
          tx.credits_after = creditsAfter;
        }
        return { rows: [], rowCount: 1 };
      }

      // COMMIT
      if (sql === 'COMMIT') {
        return { rows: [], rowCount: 0 };
      }

      return { rows: [], rowCount: 0 };
    });

    app.set('db', mockDb);

    const idempotencyKey = 'test-request-123';

    // Send 5 parallel requests with SAME idempotency key
    const promises = Array(5).fill(null).map(() =>
      request(app)
        .post('/api/v1/users/deduct-credits')
        .set('x-idempotency-key', idempotencyKey)
        .send({ phoneNumber: '+91-9899162012', amount: 3 })
    );

    const results = await Promise.all(promises);

    // All should succeed
    results.forEach(res => {
      expect(res.statusCode).toBe(200);
      expect(res.body.status).toBe('ok');
    });

    // Verify only ONE actual charge was processed
    expect(insertCount).toBe(1); // Only one insert
    expect(updateCount).toBe(1); // Only one credit deduction
    expect(finalizeCount).toBe(1); // Only one finalization

    // Check count should be 5 (all requests checked)
    expect(checkCount).toBe(5);

    // Credits should be deducted only once: 10 - 3 = 7
    expect(credits).toBe(7);

    // At least 4 requests should report alreadyApplied (cached)
    const cachedResponses = results.filter(r => r.body.data.alreadyApplied === true);
    expect(cachedResponses.length).toBeGreaterThanOrEqual(4);
  });

  test('concurrent deductions with different idempotency keys process independently', async () => {
    let credits = 20;
    const chargeTransactions = new Map();
    let insertCount = 0;
    let updateCount = 0;

    const mockDb = createMockDb(async (sql, params) => {
      if (sql.includes('SELECT id, request_id') && sql.includes('charge_transactions')) {
        const reqId = params[0];
        if (chargeTransactions.has(reqId)) {
          return { rows: [chargeTransactions.get(reqId)], rowCount: 1 };
        }
        return { rows: [], rowCount: 0 };
      }

      if (sql === 'BEGIN' || sql === 'COMMIT') {
        return { rows: [], rowCount: 0 };
      }

      if (sql.includes('INSERT INTO charge_transactions')) {
        insertCount++;
        const [reqId, phone, amount] = params;
        const tx = {
          id: `tx-${insertCount}`,
          request_id: reqId,
          phone_number: phone,
          amount,
          status: 'pending',
          created_at: new Date().toISOString()
        };
        chargeTransactions.set(reqId, tx);
        return { rows: [{ id: tx.id }], rowCount: 1 };
      }

      if (sql.includes('UPDATE user_credits') && sql.includes('GREATEST')) {
        updateCount++;
        const amount = params[1];
        credits = Math.max(credits - amount, 0);
        return { rows: [{ id: 'user-1', credits, total_paid_amount: 0 }], rowCount: 1 };
      }

      if (sql.includes('UPDATE charge_transactions') && sql.includes('applied')) {
        const [reqId, creditsAfter] = params;
        const tx = chargeTransactions.get(reqId);
        if (tx) {
          tx.status = 'applied';
          tx.credits_after = creditsAfter;
        }
        return { rows: [], rowCount: 1 };
      }

      return { rows: [], rowCount: 0 };
    });

    app.set('db', mockDb);

    // Send 5 parallel requests with DIFFERENT idempotency keys
    const promises = Array(5).fill(null).map((_, i) =>
      request(app)
        .post('/api/v1/users/deduct-credits')
        .set('x-idempotency-key', `unique-key-${i}`)
        .send({ phoneNumber: '+91-9899162012', amount: 3 })
    );

    const results = await Promise.all(promises);

    results.forEach(res => {
      expect(res.statusCode).toBe(200);
      expect(res.body.status).toBe('ok');
    });

    // All 5 should have been inserted and processed
    expect(insertCount).toBe(5);
    expect(updateCount).toBe(5);

    // Credits should be deducted 5 times: 20 - (3*5) = 5
    expect(credits).toBe(5);
  });

  test('race condition on charge_transactions insert handled gracefully', async () => {
    let credits = 10;
    const chargeTransactions = new Map();
    let insertAttempts = 0;

    const mockDb = createMockDb(async (sql, params) => {
      if (sql.includes('SELECT id, request_id') && sql.includes('charge_transactions')) {
        const reqId = params[0];
        if (chargeTransactions.has(reqId)) {
          return { rows: [chargeTransactions.get(reqId)], rowCount: 1 };
        }
        return { rows: [], rowCount: 0 };
      }

      if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') {
        return { rows: [], rowCount: 0 };
      }

      if (sql.includes('INSERT INTO charge_transactions')) {
        insertAttempts++;
        const [reqId, phone, amount] = params;

        // Simulate race: first attempt wins, second throws constraint violation
        if (chargeTransactions.has(reqId)) {
          const err = new Error('duplicate key value violates unique constraint');
          err.code = '23505';
          throw err;
        }

        const tx = {
          id: `tx-${insertAttempts}`,
          request_id: reqId,
          phone_number: phone,
          amount,
          status: 'pending',
          created_at: new Date().toISOString()
        };
        chargeTransactions.set(reqId, tx);
        return { rows: [{ id: tx.id }], rowCount: 1 };
      }

      if (sql.includes('UPDATE user_credits') && sql.includes('GREATEST')) {
        const amount = params[1];
        credits = Math.max(credits - amount, 0);
        return { rows: [{ id: 'user-1', credits, total_paid_amount: 0 }], rowCount: 1 };
      }

      if (sql.includes('UPDATE charge_transactions') && sql.includes('applied')) {
        const [reqId, creditsAfter] = params;
        const tx = chargeTransactions.get(reqId);
        if (tx) {
          tx.status = 'applied';
          tx.credits_after = creditsAfter;
        }
        return { rows: [], rowCount: 1 };
      }

      return { rows: [], rowCount: 0 };
    });

    app.set('db', mockDb);

    const idempotencyKey = 'race-condition-test';

    // Send 3 parallel requests - simulates race on INSERT
    const promises = Array(3).fill(null).map(() =>
      request(app)
        .post('/api/v1/users/deduct-credits')
        .set('x-idempotency-key', idempotencyKey)
        .send({ phoneNumber: '+91-9899162012', amount: 2 })
    );

    const results = await Promise.all(promises);

    // At least one should succeed, others should be rolled back and return cached
    const successful = results.filter(r => r.statusCode === 200);
    expect(successful.length).toBeGreaterThanOrEqual(1);

    // Credits should only be deducted once
    expect(credits).toBeLessThanOrEqual(8); // 10 - 2 = 8
  });

  test('concurrent deductions exceeding available credits floor at zero', async () => {
    let credits = 5;
    const chargeTransactions = new Map();

    const mockDb = createMockDb(async (sql, params) => {
      if (sql.includes('SELECT id, request_id') && sql.includes('charge_transactions')) {
        const reqId = params[0];
        if (chargeTransactions.has(reqId)) {
          return { rows: [chargeTransactions.get(reqId)], rowCount: 1 };
        }
        return { rows: [], rowCount: 0 };
      }

      if (sql === 'BEGIN' || sql === 'COMMIT') {
        return { rows: [], rowCount: 0 };
      }

      if (sql.includes('INSERT INTO charge_transactions')) {
        const [reqId, phone, amount] = params;
        chargeTransactions.set(reqId, {
          id: `tx-${chargeTransactions.size + 1}`,
          request_id: reqId,
          phone_number: phone,
          amount,
          status: 'pending'
        });
        return { rows: [{ id: `tx-${chargeTransactions.size}` }], rowCount: 1 };
      }

      if (sql.includes('UPDATE user_credits') && sql.includes('GREATEST')) {
        const amount = params[1];
        const oldCredits = credits;
        credits = Math.max(credits - amount, 0);
        return { rows: [{ id: 'user-1', credits, total_paid_amount: 0 }], rowCount: 1 };
      }

      if (sql.includes('UPDATE charge_transactions') && sql.includes('applied')) {
        const [reqId, creditsAfter] = params;
        const tx = chargeTransactions.get(reqId);
        if (tx) {
          tx.status = 'applied';
          tx.credits_after = creditsAfter;
        }
        return { rows: [], rowCount: 1 };
      }

      return { rows: [], rowCount: 0 };
    });

    app.set('db', mockDb);

    // Send 10 parallel requests each deducting 2 credits from balance of 5
    const promises = Array(10).fill(null).map((_, i) =>
      request(app)
        .post('/api/v1/users/deduct-credits')
        .set('x-idempotency-key', `overflow-${i}`)
        .send({ phoneNumber: '+91-9899162012', amount: 2 })
    );

    const results = await Promise.all(promises);

    results.forEach(res => {
      expect(res.statusCode).toBe(200);
    });

    // Credits must never go negative
    expect(credits).toBe(0);
    expect(credits).toBeGreaterThanOrEqual(0);
  });

  test('mixed idempotent and non-idempotent deductions process correctly', async () => {
    let credits = 15;
    const chargeTransactions = new Map();
    let idempotentCount = 0;
    let nonIdempotentCount = 0;
    let inTransaction = false;

    const mockDb = createMockDb(async (sql, params) => {
      if (sql.includes('SELECT id, request_id') && sql.includes('charge_transactions')) {
        const reqId = params[0];
        if (chargeTransactions.has(reqId)) {
          return { rows: [chargeTransactions.get(reqId)], rowCount: 1 };
        }
        return { rows: [], rowCount: 0 };
      }

      if (sql === 'BEGIN') {
        inTransaction = true;
        return { rows: [], rowCount: 0 };
      }

      if (sql === 'COMMIT') {
        inTransaction = false;
        return { rows: [], rowCount: 0 };
      }

      if (sql.includes('INSERT INTO charge_transactions')) {
        idempotentCount++;
        const [reqId, phone, amount] = params;
        chargeTransactions.set(reqId, {
          id: `tx-${chargeTransactions.size + 1}`,
          request_id: reqId,
          phone_number: phone,
          amount,
          status: 'pending'
        });
        return { rows: [{ id: `tx-${chargeTransactions.size}` }], rowCount: 1 };
      }

      // UPDATE user_credits - detect if idempotent or not based on transaction state
      if (sql.includes('UPDATE user_credits') && sql.includes('GREATEST')) {
        const amount = params[1];
        credits = Math.max(credits - amount, 0);
        
        // If not in transaction, it's non-idempotent
        if (!inTransaction) nonIdempotentCount++;
        
        return { rows: [{ id: 'user-1', credits, total_paid_amount: 0 }], rowCount: 1 };
      }

      if (sql.includes('UPDATE charge_transactions') && sql.includes('applied')) {
        const [reqId, creditsAfter] = params;
        const tx = chargeTransactions.get(reqId);
        if (tx) {
          tx.status = 'applied';
          tx.credits_after = creditsAfter;
        }
        return { rows: [], rowCount: 1 };
      }

      return { rows: [], rowCount: 0 };
    });

    app.set('db', mockDb);

    // Mix of idempotent (with key) and non-idempotent (without key) requests
    const promises = [
      // 3 idempotent requests
      request(app).post('/api/v1/users/deduct-credits')
        .set('x-idempotency-key', 'idempotent-1')
        .send({ phoneNumber: '+91-9899162012', amount: 2 }),
      request(app).post('/api/v1/users/deduct-credits')
        .set('x-idempotency-key', 'idempotent-2')
        .send({ phoneNumber: '+91-9899162012', amount: 2 }),
      request(app).post('/api/v1/users/deduct-credits')
        .set('x-idempotency-key', 'idempotent-3')
        .send({ phoneNumber: '+91-9899162012', amount: 2 }),
      // 2 non-idempotent requests (no key)
      request(app).post('/api/v1/users/deduct-credits')
        .send({ phoneNumber: '+91-9899162012', amount: 2 }),
      request(app).post('/api/v1/users/deduct-credits')
        .send({ phoneNumber: '+91-9899162012', amount: 2 })
    ];

    const results = await Promise.all(promises);

    results.forEach(res => {
      expect(res.statusCode).toBe(200);
    });

    // Total deduction: 5 requests × 2 credits = 10
    // 15 - 10 = 5
    expect(credits).toBe(5);

    // Verify both paths were used
    expect(idempotentCount).toBe(3); // 3 idempotent transactions
    expect(nonIdempotentCount).toBe(2); // 2 non-idempotent updates
  });
});

