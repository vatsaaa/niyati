const request = require('supertest');

describe('credits and transactions endpoints', () => {
  let app;

  beforeEach(() => {
    jest.resetModules();
    jest.mock('@niyati/commons', () => {
      const { createMockCommons } = require('@test-helpers');
      return createMockCommons({
        authenticateOrReject: (req, res, next) => next()
      });
    });
    const router = require('../lib/users');
    const { createTestApp } = require('@test-helpers');
    ({ app } = createTestApp('/api/v1/users', router));
  });

  afterEach(() => jest.restoreAllMocks());

  // =========================================================================
  // GET /users/credits
  // =========================================================================

  describe('GET /credits', () => {
    test('returns credit balance for valid user', async () => {
      const { createMockDb } = require('@test-helpers');
      const mockDb = createMockDb(async (sql) => {
        if (sql.includes('user_credits') && sql.includes('user_profiles')) {
          return {
            rows: [{
              credits: 8,
              is_paid: false,
              total_paid_amount: 0,
              credits_last_reset: '2026-02-01'
            }],
            rowCount: 1
          };
        }
        return { rows: [], rowCount: 0 };
      });
      app.set('db', mockDb);

      const res = await request(app)
        .get('/api/v1/users/credits')
        .query({ phoneNumber: '+919899162012' })
        .set('Authorization', 'Bearer test-token');

      expect(res.statusCode).toBe(200);
      expect(res.body.status).toBe('ok');
      expect(res.body.data).toHaveProperty('credits', 8);
      expect(res.body.data).toHaveProperty('isPaid', false);
    });

    test('returns 404 when user not found', async () => {
      const { createMockDb } = require('@test-helpers');
      app.set('db', createMockDb({ rows: [], rowCount: 0 }));

      const res = await request(app)
        .get('/api/v1/users/credits')
        .query({ phoneNumber: '+919899162012' })
        .set('Authorization', 'Bearer test-token');

      expect(res.statusCode).toBe(404);
    });

    test('rejects when phoneNumber is missing', async () => {
      const { createMockDb } = require('@test-helpers');
      app.set('db', createMockDb());

      const res = await request(app)
        .get('/api/v1/users/credits')
        .set('Authorization', 'Bearer test-token');

      expect(res.statusCode).toBe(400);
    });
  });

  // =========================================================================
  // GET /users/transactions
  // =========================================================================

  describe('GET /transactions', () => {
    test('returns transaction history for valid user', async () => {
      const { createMockDb } = require('@test-helpers');
      const mockDb = createMockDb(async (sql) => {
        if (sql.includes('user_profiles') && !sql.includes('charge_transactions')) {
          return { rows: [{ user_id: 'user-1' }], rowCount: 1 };
        }
        if (sql.includes('charge_transactions')) {
          return {
            rows: [
              {
                id: 'txn-2',
                request_id: 'req_payment_001',
                credits_charged: 50,
                query_type: 'payment',
                status: 'completed',
                created_at: '2026-02-15T15:08:30Z'
              },
              {
                id: 'txn-1',
                request_id: 'req_a1b2c3d4e5f6',
                credits_charged: -2,
                query_type: 'horoscope',
                status: 'completed',
                created_at: '2026-02-15T14:35:00Z'
              }
            ],
            rowCount: 2
          };
        }
        return { rows: [], rowCount: 0 };
      });
      app.set('db', mockDb);

      const res = await request(app)
        .get('/api/v1/users/transactions')
        .query({ phoneNumber: '+919899162012' })
        .set('Authorization', 'Bearer test-token');

      expect(res.statusCode).toBe(200);
      expect(res.body.status).toBe('ok');
      expect(res.body.data).toHaveProperty('transactions');
      expect(res.body.data.transactions).toHaveLength(2);
    });

    test('returns empty array when no transactions', async () => {
      const { createMockDb } = require('@test-helpers');
      const mockDb = createMockDb(async (sql) => {
        if (sql.includes('user_profiles') && !sql.includes('charge_transactions')) {
          return { rows: [{ user_id: 'user-1' }], rowCount: 1 };
        }
        return { rows: [], rowCount: 0 };
      });
      app.set('db', mockDb);

      const res = await request(app)
        .get('/api/v1/users/transactions')
        .query({ phoneNumber: '+919899162012' })
        .set('Authorization', 'Bearer test-token');

      expect(res.statusCode).toBe(200);
      expect(res.body.data.transactions).toEqual([]);
    });

    test('rejects when phoneNumber is missing', async () => {
      const { createMockDb } = require('@test-helpers');
      app.set('db', createMockDb());

      const res = await request(app)
        .get('/api/v1/users/transactions')
        .set('Authorization', 'Bearer test-token');

      expect(res.statusCode).toBe(400);
    });

    test('returns 404 when user not found', async () => {
      const { createMockDb } = require('@test-helpers');
      app.set('db', createMockDb({ rows: [], rowCount: 0 }));

      const res = await request(app)
        .get('/api/v1/users/transactions')
        .query({ phoneNumber: '+919899162012' })
        .set('Authorization', 'Bearer test-token');

      expect(res.statusCode).toBe(404);
    });

    test('respects limit query parameter', async () => {
      const { createMockDb } = require('@test-helpers');
      const mockDb = createMockDb(async (sql) => {
        if (sql.includes('user_profiles') && !sql.includes('charge_transactions')) {
          return { rows: [{ user_id: 'user-1' }], rowCount: 1 };
        }
        if (sql.includes('charge_transactions')) {
          return { rows: [{ id: 'txn-1', credits_charged: -2, query_type: 'horoscope', status: 'completed', created_at: new Date().toISOString() }], rowCount: 1 };
        }
        return { rows: [], rowCount: 0 };
      });
      app.set('db', mockDb);

      const res = await request(app)
        .get('/api/v1/users/transactions')
        .query({ phoneNumber: '+919899162012', limit: 5 })
        .set('Authorization', 'Bearer test-token');

      expect(res.statusCode).toBe(200);
    });
  });
});
