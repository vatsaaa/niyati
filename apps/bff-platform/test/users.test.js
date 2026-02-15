const request = require('supertest');
const { createTestApp, createMockDb } = require('@test-helpers');
const axios = require('axios');
jest.mock('axios');

describe('bff-platform users routes', () => {
  let app;

  beforeEach(() => {
    jest.resetModules();
    // ensure service token isn't enforced in unit tests
    process.env.SERVICE_TOKEN = '';

    jest.mock('@niyati/commons', () => {
      const responses = require('@niyati/commons/lib/responses');
      return {
        logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn(), fatal: jest.fn(), trace: jest.fn(), warn: jest.fn(), error: jest.fn() },
        sanitize: v => v,
        ErrorCodes: responses.ErrorCodes,
        config: {},
        dateUtils: { computeIsAdult: jest.fn(() => true) },
        // Passthrough auth middleware for business-logic tests
        authenticateOrReject: (req, res, next) => next()
      };
    });

    const router = require('../lib/users');
    const { app: testApp } = createTestApp('/api/v1/users', router);
    app = testApp;
  });

  afterEach(() => jest.restoreAllMocks());

  describe('POST /identify', () => {
    test('uses BFF_AUTH_URL when BFF_AUTH_BASE not set', async () => {
      delete process.env.BFF_AUTH_BASE;
      process.env.BFF_AUTH_URL = 'http://bff-auth:4001';
      const fakeDb = { async query(sql, params) { return { rows: [], rowCount: 0 }; } };
      const getMock = jest.fn().mockResolvedValueOnce({ data: { status: 'ok', data: { user: null } } });
      require('axios').get = getMock;
      app.set('db', fakeDb);
      await request(app).post('/api/v1/users/identify').send({ phoneNumber: '+1234' });
      expect(getMock).toHaveBeenCalledWith(
        expect.stringContaining('http://bff-auth:4001/api/v1/internal/users/lookup'),
        expect.any(Object)
      );
      delete process.env.BFF_AUTH_URL;
    });

    test('returns returning false when user not found', async () => {
      const fakeDb = { async query(sql, params) { return { rows: [], rowCount: 0 }; } };
      // mock bff-auth lookup to return no user (avoid network call)
      require('axios').get = jest.fn().mockResolvedValueOnce({ data: { status: 'ok', data: { user: null } } });
      app.set('db', fakeDb);
      const res = await request(app).post('/api/v1/users/identify').send({ phoneNumber: '+1234' });
      expect(res.statusCode).toBe(200);
      expect(res.body.data.returning).toBe(false);
    });

    test('returns returning true and normalized user data for returning user', async () => {
      const sampleUser = {
        id: 7,
        phone_number: '+91-8888888888',
        name: 'Return User',
        date_of_birth: '1990-01-01',
        time_of_birth: '00:00:00',
        place_of_birth: 'Delhi',
        consent_given: true,
        credits: 3,
        credits_last_reset: null,
        total_paid_amount: 0,
        last_login_location: 'Mumbai',
        is_adult: true
      };
      const fakeDb = createMockDb({ rows: [sampleUser], rowCount: 1 });
      // mock bff-auth lookup to return the sample user
      require('axios').get = jest.fn().mockResolvedValueOnce({ data: { status: 'ok', data: { user: sampleUser } } });
      app.set('db', fakeDb);
      const res = await request(app).post('/api/v1/users/identify').send({ phoneNumber: '+91-8888888888' });
      expect(res.statusCode).toBe(200);
      expect(res.body.status).toBe('ok');
      expect(res.body.data.returning).toBe(true);
      expect(res.body.data.user).toHaveProperty('id', 7);
      expect(res.body.data.user).toHaveProperty('is_adult', true);
    });
  });

  describe('POST /sync', () => {
    test('returns 200 for valid profile', async () => {
      const fakeDb = createMockDb(async (sql, params) => {
        return { rows: [{ id: 1, phone_number: params[0] }], rowCount: 1 };
      });
      app.set('db', fakeDb);
      const res = await request(app).post('/api/v1/users/sync').set('X-Service-Token', process.env.SERVICE_TOKEN || '').send({ phoneNumber: '+1234', consentGiven: true });
      expect(res.statusCode).toBe(200);
      expect(res.body.status).toBe('ok');
    });

    test('creates a new user with default credits and returns user object', async () => {
      const fakeDb = createMockDb(async (sql, params) => {
        const s = (sql || '').toLowerCase();
        if (s.includes('insert into user_profiles') || s.includes('user_profiles')) {
          return { rows: [{ user_id: 99, id: 99, phone_number: params[0], credits: 10 }], rowCount: 1 };
        }
        if (s.includes('insert into user_credits') || s.includes('user_credits')) {
          return { rows: [{ user_id: 99, credits: 10, total_paid_amount: 0 }], rowCount: 1 };
        }
        return { rows: [], rowCount: 0 };
      });
      app.set('db', fakeDb);
      const res = await request(app).post('/api/v1/users/sync').set('X-Service-Token', process.env.SERVICE_TOKEN || '').send({ phoneNumber: '+919999999999', consentGiven: true });
      expect(res.statusCode).toBe(200);
      expect(res.body.status).toBe('ok');
      expect(res.body.data.user).toHaveProperty('id', 99);
      expect(res.body.data.user).toHaveProperty('credits', 10);
    });
  });

  describe('POST /profile', () => {
    test('computes and returns is_adult=true for adult DOB', async () => {
      const fakeDb = createMockDb(async (sql, params) => {
        if (sql.trim().toUpperCase().includes('USER_PROFILES')) {
          return { rows: [{ user_id: 'uuid-1', phone_number: params[0], is_adult: true, last_login_location: null }], rowCount: 1 };
        }
        if (sql.trim().toUpperCase().includes('USER_CREDITS')) {
          return { rows: [{ user_id: 'uuid-1', credits: 10, total_paid_amount: 0 }], rowCount: 1 };
        }
        return { rows: [{ id: 'uuid-1', phone_number: params && params[0] }], rowCount: 1 };
      });
      app.set('db', fakeDb);

      const res = await request(app).post('/api/v1/users/profile').send({ phoneNumber: '+911234', dateOfBirth: '1990-01-01' });
      expect(res.statusCode).toBe(200);
      expect(res.body.status).toBe('ok');
      expect(res.body.data.user).toHaveProperty('is_adult', true);
    });

    test('upserts into auth users table after profile + credits', async () => {
      const queryCalls = [];
      const fakeDb = createMockDb(async (sql, params) => {
        queryCalls.push({ sql, params });
        const s = sql.trim().toUpperCase();
        if (s.includes('USER_PROFILES')) {
          return { rows: [{ user_id: 'uuid-1', phone_number: '+919899162012', is_adult: true, name: 'Ankur', last_login_location: null }], rowCount: 1 };
        }
        if (s.includes('USER_CREDITS')) {
          return { rows: [{ user_id: 'uuid-1', credits: 10, total_paid_amount: 0 }], rowCount: 1 };
        }
        // auth users upsert
        return { rows: [{ id: 'uuid-1', phone_number: '+919899162012', name: 'Ankur' }], rowCount: 1 };
      });
      app.set('db', fakeDb);

      const res = await request(app).post('/api/v1/users/profile').send({
        phoneNumber: '+919899162012',
        name: 'Ankur',
        dateOfBirth: '1979-05-19',
        timeOfBirth: '09:30',
        placeOfBirth: 'New Delhi',
        consentGiven: true
      });
      expect(res.statusCode).toBe(200);
      // Should have at least 3 queries: user_profiles, user_credits, users
      const usersInsert = queryCalls.find(c => {
        const s = (c.sql || '').toUpperCase();
        return s.includes('INSERT INTO USERS') && !s.includes('USER_PROFILES') && !s.includes('USER_CREDITS');
      });
      expect(usersInsert).toBeDefined();
      expect(usersInsert.params[0]).toBe('+919899162012');
    });
  });

  describe('POST /can-ask', () => {
    test('free user with sufficient credits can ask today question', async () => {
      const fakeDb = {
        async query(sql, params) {
          if (sql && sql.toUpperCase().startsWith('SELECT KEY')) return { rows: [], rowCount: 0 };
          if (sql && sql.toUpperCase().includes('SELECT CREDITS')) {
            return { rows: [{ credits: 15, is_paid: false }], rowCount: 1 };
          }
          return { rows: [], rowCount: 0 };
        }
      };
      app.set('db', fakeDb);

      const res = await request(app).post('/api/v1/users/can-ask').send({ phoneNumber: '+91111', question: 'How is my day today?' });
      expect(res.statusCode).toBe(200);
      expect(res.body.data.allowed).toBe(true);
      expect(res.body.data.cost).toBe(2);
    });

    test('free user with low credits cannot ask future question', async () => {
      const fakeDb = {
        async query(sql, params) {
          const s = (sql || '').toLowerCase();
          if (s.includes('select key')) return { rows: [], rowCount: 0 };
          if (s.includes('from user_profiles') || s.includes('user_credits') || s.includes('select uc.credits')) {
            return { rows: [{ credits: 8, is_paid: false }], rowCount: 1 };
          }
          return { rows: [], rowCount: 0 };
        }
      };
      app.set('db', fakeDb);

      const res = await request(app).post('/api/v1/users/can-ask').send({ phoneNumber: '+91222', question: 'How will my career be next 6 months?' });
      expect(res.statusCode).toBe(200);
      expect(res.body.data.allowed).toBe(false);
      expect(res.body.data.reason).toBe('low_credits_restricts_future');
    });

    test('paid user can ask future question if has credits', async () => {
      const fakeDb = {
        async query(sql, params) {
          const s = (sql || '').toLowerCase();
          if (s.includes('select key')) return { rows: [], rowCount: 0 };
          if (s.includes('from user_profiles') || s.includes('user_credits') || s.includes('select uc.credits')) {
            return { rows: [{ credits: 20, is_paid: true }], rowCount: 1 };
          }
          return { rows: [], rowCount: 0 };
        }
      };
      app.set('db', fakeDb);

      const res = await request(app).post('/api/v1/users/can-ask').send({ phoneNumber: '+91333', question: 'When will I get married?' });
      expect(res.statusCode).toBe(200);
      expect(res.body.data.allowed).toBe(true);
      expect(res.body.data.cost).toBe(4);
    });

    test('user with insufficient credits is blocked', async () => {
      const fakeDb = {
        async query(sql, params) {
          const s = (sql || '').toLowerCase();
          if (s.includes('select key')) return { rows: [], rowCount: 0 };
          if (s.includes('from user_profiles') || s.includes('user_credits') || s.includes('select uc.credits')) {
            return { rows: [{ credits: 1, is_paid: false }], rowCount: 1 };
          }
          return { rows: [], rowCount: 0 };
        }
      };
      app.set('db', fakeDb);

      const res = await request(app).post('/api/v1/users/can-ask').send({ phoneNumber: '+91444', question: 'How is my day today?' });
      expect(res.statusCode).toBe(200);
      expect(res.body.data.allowed).toBe(false);
      expect(res.body.data.reason).toBe('insufficient_credits');
    });
  });

  describe('Credits Management', () => {
    test('POST /deduct-credits reduces credits when sufficient', async () => {
      const fakeDb = {
        async query(sql, params) {
          if (sql.includes('UPDATE user_credits') && sql.includes('GREATEST')) {
            const amt = params[1];
            return { rows: [{ id: 1, credits: 5 - amt, total_paid_amount: 0 }], rowCount: 1 };
          }
          return { rows: [], rowCount: 0 };
        }
      };
      app.set('db', fakeDb);

      const res = await request(app).post('/api/v1/users/deduct-credits').send({ phoneNumber: '+911234', amount: 2 });
      expect(res.statusCode).toBe(200);
      expect(res.body.data).toHaveProperty('credits', 3);
    });

    test('POST /deduct-credits floors at zero when insufficient credits', async () => {
      const fakeDb = {
        async query(sql, params) {
          if (sql.includes('UPDATE user_credits') && sql.includes('GREATEST')) {
            return { rows: [{ id: 2, credits: 0, total_paid_amount: 0 }], rowCount: 1 };
          }
          return { rows: [], rowCount: 0 };
        }
      };
      app.set('db', fakeDb);

      const res = await request(app).post('/api/v1/users/deduct-credits').send({ phoneNumber: '+91999', amount: 4 });
      expect(res.statusCode).toBe(200);
      expect(res.body.data).toHaveProperty('credits', 0);
    });

    test('POST /add-credits adds credits and updates total_paid_amount', async () => {
      const fakeDb = {
        async query(sql, params) {
          if (sql && sql.toUpperCase().startsWith('SELECT KEY')) return { rows: [], rowCount: 0 };
          if (sql.includes('UPDATE user_credits') && sql.includes('credits = credits +')) {
            const creditsAdded = params[1];
            const amountINR = params[2];
            return { rows: [{ user_id: 'user-3', credits: 7 + creditsAdded, total_paid_amount: amountINR, is_paid: true, last_payment_amount: amountINR, last_payment_verified: true, upi_id: null, upi_txn_id: null }], rowCount: 1 };
          }
          return { rows: [], rowCount: 0 };
        }
      };
      app.set('db', fakeDb);

      const res = await request(app).post('/api/v1/users/add-credits').send({ phoneNumber: '+91988', amount: 500 });
      expect(res.statusCode).toBe(200);
      expect(res.body.data.creditsAdded).toBe(50);
      expect(res.body.data.totalPaidAmount).toBe(500);
    });

    test('POST /add-credits rejects small amounts (<10 INR)', async () => {
      const fakeDb = { async query(sql, params) { return { rows: [], rowCount: 0 }; } };
      app.set('db', fakeDb);
      const res = await request(app).post('/api/v1/users/add-credits').send({ phoneNumber: '+91111', amount: 5 });
      expect(res.statusCode).toBe(400);
    });
  });

  describe('GET /config', () => {
    test('returns configurable settings', async () => {
      const fakeDb = {
        async query(sql) {
          if (sql.includes('SELECT KEY')) {
            return {
              rows: [
                { key: 'credits_monthly_free', value: '10' },
                { key: 'credits_horoscope_cost', value: '2' },
                { key: 'credits_premium_cost', value: '4' },
                { key: 'credits_per_10_inr', value: '1' },
                { key: 'credits_low_threshold', value: '4' },
                { key: 'payment_amount_inr', value: '500' }
              ]
            };
          }
          return { rows: [] };
        }
      };
      app.set('db', fakeDb);

      const res = await request(app).get('/api/v1/users/config');
      expect(res.statusCode).toBe(200);
      expect(res.body.data.credits_monthly_free).toBe(10);
      expect(res.body.data.credits_horoscope_cost).toBe(2);
    });
  });
});

// --- Authentication enforcement tests ---
// These tests verify that sensitive routes reject unauthenticated requests
// by using a REJECTING mock for authenticateOrReject.
describe('bff-platform users auth enforcement', () => {
  let app;

  beforeEach(() => {
    jest.resetModules();
    process.env.SERVICE_TOKEN = '';

    jest.mock('@niyati/commons', () => {
      const responses = require('@niyati/commons/lib/responses');
      return {
        logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn(), fatal: jest.fn(), trace: jest.fn() },
        sanitize: v => v,
        ErrorCodes: responses.ErrorCodes,
        config: {},
        dateUtils: { computeIsAdult: jest.fn(() => true) },
        // Rejecting auth middleware — returns 401 for unauthenticated requests
        authenticateOrReject: (req, res, next) => {
          const auth = req.headers.authorization || '';
          if (auth.startsWith('Bearer ')) return next();
          return res.sendError(responses.ErrorCodes.UNAUTHORIZED, 'authentication_required');
        }
      };
    });

    const router = require('../lib/users');
    const { app: testApp } = createTestApp('/api/v1/users', router);
    app = testApp;
  });

  afterEach(() => jest.restoreAllMocks());

  test('POST /deduct-credits returns 401 without auth token', async () => {
    const res = await request(app)
      .post('/api/v1/users/deduct-credits')
      .send({ phoneNumber: '+911234567890', amount: 2 });
    expect(res.statusCode).toBe(401);
    expect(res.body.status).toBe('error');
  });

  test('POST /add-credits returns 401 without auth token', async () => {
    const res = await request(app)
      .post('/api/v1/users/add-credits')
      .send({ phoneNumber: '+911234567890', amount: 50, paymentRef: 'ref-1' });
    expect(res.statusCode).toBe(401);
    expect(res.body.status).toBe('error');
  });

  test('POST /profile returns 401 without auth token', async () => {
    const res = await request(app)
      .post('/api/v1/users/profile')
      .send({ phoneNumber: '+911234567890', name: 'Test' });
    expect(res.statusCode).toBe(401);
    expect(res.body.status).toBe('error');
  });

  test('GET /config remains accessible without auth', async () => {
    const fakeDb = { async query() { return { rows: [{ key: 'credits_monthly_free', value: '10' }] }; } };
    app.set('db', fakeDb);
    const res = await request(app).get('/api/v1/users/config');
    expect(res.statusCode).toBe(200);
  });

  test('GET /lookup remains accessible without auth (service-to-service)', async () => {
    const fakeDb = { async query() { return { rows: [], rowCount: 0 }; } };
    app.set('db', fakeDb);
    const res = await request(app).get('/api/v1/users/lookup').query({ phoneNumber: '+911234567890' });
    expect(res.statusCode).toBe(200);
  });
});
