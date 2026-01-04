const request = require('supertest');
const { createMockCommons, createMockDb } = require('../../commons/test/helpers');

// This test verifies desired middleware behavior: /api/v1/chat should be protected
// while /api/v1/chat/classify should be public. This is a regression prevention test
// that should fail on the current code (which applies auth to the whole /chat path).

describe('chat auth wrapper behavior', () => {
  let app;

  beforeEach(() => {
    jest.resetModules();
    // Mock commons to avoid real auth calls and logging. Require helper inside factory.
    jest.mock('../../commons', () => require('../../commons/test/helpers').createMockCommons({}));
    // Require app after mocking
    const createApp = require('../src/index');
    // src/index exports an Express app
    app = createApp;
  });

  afterEach(() => jest.restoreAllMocks());

  test('POST /api/v1/chat/classify should be accessible without Authorization', async () => {
    const mockDb = createMockDb({ rows: [], rowCount: 0 });
    app.set('db', mockDb);

    const res = await request(app)
      .post('/api/v1/chat/classify')
      .send({ message: 'Hello' });

    expect(res.statusCode).toBe(200);
  });

  test('POST /api/v1/chat (protected route) should return 401 without token', async () => {
    const mockDb = createMockDb({ rows: [], rowCount: 0 });
    app.set('db', mockDb);

    const res = await request(app)
      .post('/api/v1/chat')
      .send({ message: 'Hello', sessionId: 'abc' });

    // Because authentication middleware is intended, expect unauthorized when no token
    expect(res.statusCode).toBe(401);
  });
});
