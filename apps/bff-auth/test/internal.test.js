const request = require('supertest');
const { createTestApp, createMockDb } = require('@test-helpers');

describe('internal users routes', () => {
  let app;

  beforeEach(() => {
    jest.resetModules();
    // Ensure SERVICE_TOKEN not set for default tests
    delete process.env.SERVICE_TOKEN;
    const internalRouter = require('../lib/internal');
    const { app: testApp } = createTestApp('/api/v1/internal', internalRouter, { db: null });
    app = testApp;
  });

  afterEach(() => jest.restoreAllMocks());

  test('GET /users/lookup returns user when found', async () => {
    const mockDb = createMockDb({ rows: [{ id: '1111-2222', phone_number: '+911234', name: 'Test', date_of_birth: null }], rowCount: 1 });
    app.set('db', mockDb);

    // When SERVICE_TOKEN is not set, endpoint should allow access
    const res = await request(app).get('/api/v1/internal/users/lookup').query({ phoneNumber: '+911234' });
    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.data.user).toBeTruthy();
    expect(res.body.data.user.phone_number).toBe('+911234');
  });

  test('GET /users/lookup respects service token when configured', async () => {
    const mockDb = createMockDb({ rows: [] });
    app.set('db', mockDb);

    process.env.SERVICE_TOKEN = 's3cr3t';
    const resNoHeader = await request(app).get('/api/v1/internal/users/lookup').query({ phoneNumber: '+911234' });
    expect(resNoHeader.statusCode).toBe(401);

    const resWithHeader = await request(app).get('/api/v1/internal/users/lookup').set('X-Service-Token', 's3cr3t').query({ phoneNumber: '+911234' });
    expect(resWithHeader.statusCode).toBe(200);
    expect(resWithHeader.body.status).toBe('ok');

    delete process.env.SERVICE_TOKEN;
  });
});
