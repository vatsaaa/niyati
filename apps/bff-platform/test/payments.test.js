const request = require('supertest');

describe('payments routes', () => {
  let app;

  beforeEach(() => {
    jest.resetModules();
    jest.mock('@niyati/commons', () => {
      const { createMockCommons } = require('@test-helpers');
      return createMockCommons({
        authenticateOrReject: (req, res, next) => next()
      });
    });
    const router = require('../lib/payments');
    const { createTestApp } = require('@test-helpers');
    ({ app } = createTestApp('/api/v1/payments', router));
  });

  afterEach(() => jest.restoreAllMocks());

  // =========================================================================
  // POST /payments/submit
  // =========================================================================

  describe('POST /submit', () => {
    test('returns 200 and verification record on valid submission', async () => {
      const { createMockDb } = require('@test-helpers');
      const mockDb = createMockDb(async (sql) => {
        if (sql.includes('INSERT INTO payment_verifications')) {
          return {
            rows: [{
              verification_id: 'verify-abc',
              user_id: 'user-1',
              upi_id: 'ankur@oksbi',
              transaction_id: '260215123456',
              amount: 500,
              currency: 'INR',
              credits: 50,
              status: 'pending',
              submitted_at: new Date().toISOString()
            }],
            rowCount: 1
          };
        }
        // user_profiles lookup
        if (sql.includes('user_profiles')) {
          return { rows: [{ user_id: 'user-1' }], rowCount: 1 };
        }
        return { rows: [], rowCount: 0 };
      });
      app.set('db', mockDb);

      const res = await request(app)
        .post('/api/v1/payments/submit')
        .set('Authorization', 'Bearer test-token')
        .send({
          phoneNumber: '+919899162012',
          upiId: 'ankur@oksbi',
          transactionId: '260215123456',
          amount: 500
        });

      expect(res.statusCode).toBe(200);
      expect(res.body.status).toBe('ok');
      expect(res.body.data).toHaveProperty('verificationId');
      expect(res.body.data.status).toBe('pending');
    });

    test('rejects when upiId is missing', async () => {
      const { createMockDb } = require('@test-helpers');
      app.set('db', createMockDb());

      const res = await request(app)
        .post('/api/v1/payments/submit')
        .set('Authorization', 'Bearer test-token')
        .send({ phoneNumber: '+919899162012', transactionId: '260215123456', amount: 500 });

      expect(res.statusCode).toBe(400);
    });

    test('rejects when transactionId is not 12 digits', async () => {
      const { createMockDb } = require('@test-helpers');
      app.set('db', createMockDb());

      const res = await request(app)
        .post('/api/v1/payments/submit')
        .set('Authorization', 'Bearer test-token')
        .send({ phoneNumber: '+919899162012', upiId: 'a@oksbi', transactionId: '123', amount: 500 });

      expect(res.statusCode).toBe(400);
    });

    test('rejects when phoneNumber is missing', async () => {
      const { createMockDb } = require('@test-helpers');
      app.set('db', createMockDb());

      const res = await request(app)
        .post('/api/v1/payments/submit')
        .set('Authorization', 'Bearer test-token')
        .send({ upiId: 'a@oksbi', transactionId: '260215123456', amount: 500 });

      expect(res.statusCode).toBe(400);
    });

    test('returns conflict when duplicate transactionId exists', async () => {
      const { createMockDb } = require('@test-helpers');
      const mockDb = createMockDb(async (sql) => {
        if (sql.includes('user_profiles')) {
          return { rows: [{ user_id: 'user-1' }], rowCount: 1 };
        }
        if (sql.includes('INSERT INTO payment_verifications')) {
          const err = new Error('duplicate key');
          err.code = '23505'; // PG unique violation
          throw err;
        }
        return { rows: [], rowCount: 0 };
      });
      app.set('db', mockDb);

      const res = await request(app)
        .post('/api/v1/payments/submit')
        .set('Authorization', 'Bearer test-token')
        .send({ phoneNumber: '+919899162012', upiId: 'a@oksbi', transactionId: '260215123456', amount: 500 });

      expect(res.statusCode).toBe(409);
    });

    test('returns 404 when user not found', async () => {
      const { createMockDb } = require('@test-helpers');
      const mockDb = createMockDb(async (sql) => {
        return { rows: [], rowCount: 0 };
      });
      app.set('db', mockDb);

      const res = await request(app)
        .post('/api/v1/payments/submit')
        .set('Authorization', 'Bearer test-token')
        .send({ phoneNumber: '+919899162012', upiId: 'a@oksbi', transactionId: '260215123456', amount: 500 });

      expect(res.statusCode).toBe(404);
    });
  });

  // =========================================================================
  // GET /payments/status/:verificationId
  // =========================================================================

  describe('GET /status/:verificationId', () => {
    test('returns verification status for valid ID', async () => {
      const { createMockDb } = require('@test-helpers');
      const mockDb = createMockDb(async (sql) => {
        if (sql.includes('payment_verifications')) {
          return {
            rows: [{
              verification_id: 'verify-abc',
              status: 'pending',
              submitted_at: '2026-02-15T15:05:00Z',
              verified_at: null,
              credits: 50,
              amount: 500
            }],
            rowCount: 1
          };
        }
        return { rows: [], rowCount: 0 };
      });
      app.set('db', mockDb);

      const res = await request(app)
        .get('/api/v1/payments/status/verify-abc')
        .set('Authorization', 'Bearer test-token');

      expect(res.statusCode).toBe(200);
      expect(res.body.status).toBe('ok');
      expect(res.body.data).toHaveProperty('status', 'pending');
      expect(res.body.data).toHaveProperty('credits', 50);
    });

    test('returns 404 for unknown verificationId', async () => {
      const { createMockDb } = require('@test-helpers');
      app.set('db', createMockDb({ rows: [], rowCount: 0 }));

      const res = await request(app)
        .get('/api/v1/payments/status/nonexistent')
        .set('Authorization', 'Bearer test-token');

      expect(res.statusCode).toBe(404);
    });
  });

  // =========================================================================
  // POST /payments/verify (admin trigger)
  // =========================================================================

  describe('POST /verify', () => {
    test('marks payment as verified and provisions credits', async () => {
      const { createMockDb } = require('@test-helpers');
      let updatedStatus = null;
      let creditsAdded = false;
      const mockDb = createMockDb(async (sql, params) => {
        // Look up pending verification
        if (sql.includes('SELECT') && sql.includes('payment_verifications') && !sql.includes('UPDATE')) {
          return {
            rows: [{
              verification_id: 'verify-abc',
              user_id: 'user-1',
              amount: 500,
              credits: 50,
              status: 'pending'
            }],
            rowCount: 1
          };
        }
        // Update verification status
        if (sql.includes('UPDATE payment_verifications')) {
          updatedStatus = 'verified';
          return { rows: [{ verification_id: 'verify-abc', status: 'verified' }], rowCount: 1 };
        }
        // Add credits
        if (sql.includes('UPDATE user_credits')) {
          creditsAdded = true;
          return { rows: [{ user_id: 'user-1', credits: 58 }], rowCount: 1 };
        }
        // Insert charge_transaction
        if (sql.includes('INSERT INTO charge_transactions')) {
          return { rows: [{ id: 'txn-1' }], rowCount: 1 };
        }
        return { rows: [], rowCount: 0 };
      });
      app.set('db', mockDb);

      const res = await request(app)
        .post('/api/v1/payments/verify')
        .set('Authorization', 'Bearer test-token')
        .send({ verificationId: 'verify-abc' });

      expect(res.statusCode).toBe(200);
      expect(res.body.status).toBe('ok');
      expect(res.body.data).toHaveProperty('creditsAdded', 50);
      expect(res.body.data).toHaveProperty('newBalance');
      expect(updatedStatus).toBe('verified');
      expect(creditsAdded).toBe(true);
    });

    test('returns 404 for unknown verificationId', async () => {
      const { createMockDb } = require('@test-helpers');
      app.set('db', createMockDb({ rows: [], rowCount: 0 }));

      const res = await request(app)
        .post('/api/v1/payments/verify')
        .set('Authorization', 'Bearer test-token')
        .send({ verificationId: 'nonexistent' });

      expect(res.statusCode).toBe(404);
    });

    test('rejects already-verified payment', async () => {
      const { createMockDb } = require('@test-helpers');
      const mockDb = createMockDb(async (sql) => {
        if (sql.includes('SELECT') && sql.includes('payment_verifications')) {
          return {
            rows: [{ verification_id: 'verify-abc', status: 'verified', credits: 50 }],
            rowCount: 1
          };
        }
        return { rows: [], rowCount: 0 };
      });
      app.set('db', mockDb);

      const res = await request(app)
        .post('/api/v1/payments/verify')
        .set('Authorization', 'Bearer test-token')
        .send({ verificationId: 'verify-abc' });

      expect(res.statusCode).toBe(409);
    });

    test('rejects when verificationId is missing', async () => {
      const { createMockDb } = require('@test-helpers');
      app.set('db', createMockDb());

      const res = await request(app)
        .post('/api/v1/payments/verify')
        .set('Authorization', 'Bearer test-token')
        .send({});

      expect(res.statusCode).toBe(400);
    });
  });
});
