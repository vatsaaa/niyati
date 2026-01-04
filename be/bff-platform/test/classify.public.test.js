const request = require('supertest');
const { createTestApp, createMockDb, createMockCommons } = require('@test-helpers');

describe('chat classify public endpoint', () => {
  let app;

  beforeEach(() => {
    jest.resetModules();
    // Mock commons to isolate logger and config. Require helper inside factory to satisfy Jest.
    jest.mock('../../commons', () => require('@test-helpers').createMockCommons());

    const chatRouter = require('../lib/chat');
    ({ app } = createTestApp('/api/v1/chat', chatRouter));
  });

  afterEach(() => jest.restoreAllMocks());

  test('POST /classify should be accessible without auth and return shape', async () => {
    // Provide a mock DB (not used by classify in this test)
    const mockDb = createMockDb({ rows: [], rowCount: 0 });
    app.set('db', mockDb);

    const res = await request(app)
      .post('/api/v1/chat/classify')
      .send({ message: 'Hi I am Ankur, born on 19 May 1979' });

    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty('status', 'ok');
    expect(res.body).toHaveProperty('data');
    const data = res.body.data;
    expect(data).toHaveProperty('queryType');
    expect(data).toHaveProperty('creditCost');
    expect(data).toHaveProperty('isBillable');
  });
});
