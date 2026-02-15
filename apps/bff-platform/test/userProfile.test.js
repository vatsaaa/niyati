const request = require('supertest');
const { createTestApp, createMockDb } = require('@test-helpers');

describe('bff-platform GET/DELETE /users/profile', () => {
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
        authenticateOrReject: (req, res, next) => next()
      };
    });

    const router = require('../lib/users');
    const { app: testApp } = createTestApp('/api/v1/users', router);
    app = testApp;
  });

  afterEach(() => jest.restoreAllMocks());

  describe('GET /users/profile', () => {
    test('returns 400 when phoneNumber missing', async () => {
      const mockDb = createMockDb({ rows: [], rowCount: 0 });
      app.set('db', mockDb);

      const res = await request(app).get('/api/v1/users/profile');
      expect(res.statusCode).toBe(400);
    });

    test('returns 404 when user not found', async () => {
      const mockDb = createMockDb({ rows: [], rowCount: 0 });
      app.set('db', mockDb);

      const res = await request(app)
        .get('/api/v1/users/profile')
        .query({ phoneNumber: '+919899162012' });

      expect(res.statusCode).toBe(404);
    });

    test('returns full profile for existing user', async () => {
      const profileRow = {
        user_id: 'uid-1',
        phone_number: '+919899162012',
        name: 'Ankur Vatsa',
        date_of_birth: '1979-05-19',
        time_of_birth: '09:30',
        place_of_birth: 'New Delhi',
        lat: 28.6139,
        lon: 77.2090,
        timezone: 'Asia/Kolkata',
        consent_given: true,
        is_adult: true,
        created_at: '2026-01-01T00:00:00Z'
      };

      const mockDb = createMockDb(async (sql) => {
        if (sql.includes('user_profiles')) {
          return { rows: [profileRow], rowCount: 1 };
        }
        return { rows: [], rowCount: 0 };
      });
      app.set('db', mockDb);

      const res = await request(app)
        .get('/api/v1/users/profile')
        .query({ phoneNumber: '+919899162012' });

      expect(res.statusCode).toBe(200);
      expect(res.body.status).toBe('ok');
      expect(res.body.data.profile).toHaveProperty('name', 'Ankur Vatsa');
      expect(res.body.data.profile).toHaveProperty('dateOfBirth', '1979-05-19');
      expect(res.body.data.profile).toHaveProperty('placeOfBirth', 'New Delhi');
    });

    test('returns 500 when db is not configured', async () => {
      const res = await request(app)
        .get('/api/v1/users/profile')
        .query({ phoneNumber: '+919899162012' });

      expect(res.statusCode).toBe(500);
    });
  });

  describe('DELETE /users/profile', () => {
    test('returns 400 when phoneNumber missing', async () => {
      const mockDb = createMockDb({ rows: [], rowCount: 0 });
      app.set('db', mockDb);

      const res = await request(app).delete('/api/v1/users/profile');
      expect(res.statusCode).toBe(400);
    });

    test('returns 404 when user not found', async () => {
      const mockDb = createMockDb({ rows: [], rowCount: 0 });
      app.set('db', mockDb);

      const res = await request(app)
        .delete('/api/v1/users/profile')
        .send({ phoneNumber: '+919899162012' });

      expect(res.statusCode).toBe(404);
    });

    test('deletes user profile and related data successfully', async () => {
      let deletedTables = [];
      const mockDb = createMockDb(async (sql, params) => {
        if (sql.includes('SELECT user_id')) {
          return { rows: [{ user_id: 'uid-1' }], rowCount: 1 };
        }
        if (sql.includes('DELETE')) {
          deletedTables.push(sql);
          return { rows: [], rowCount: 1 };
        }
        return { rows: [], rowCount: 0 };
      });
      app.set('db', mockDb);

      const res = await request(app)
        .delete('/api/v1/users/profile')
        .send({ phoneNumber: '+919899162012' });

      expect(res.statusCode).toBe(200);
      expect(res.body.status).toBe('ok');
      expect(res.body.data).toHaveProperty('deleted', true);
    });

    test('returns 500 when db is not configured', async () => {
      const res = await request(app)
        .delete('/api/v1/users/profile')
        .send({ phoneNumber: '+919899162012' });

      expect(res.statusCode).toBe(500);
    });
  });
});
