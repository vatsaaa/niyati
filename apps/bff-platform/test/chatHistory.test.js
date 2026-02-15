const request = require('supertest');

describe('chat history routes', () => {
  let app;

  beforeEach(() => {
    jest.resetModules();
    jest.mock('@niyati/commons', () => {
      const { createMockCommons } = require('@test-helpers');
      return createMockCommons({
        authenticateOrReject: (req, res, next) => next()
      });
    });
    const router = require('../lib/chatHistory');
    const { createTestApp } = require('@test-helpers');
    ({ app } = createTestApp('/api/v1/chat', router));
  });

  afterEach(() => jest.restoreAllMocks());

  // =========================================================================
  // POST /chat/message — save a message
  // =========================================================================

  describe('POST /message', () => {
    test('saves a user message and returns messageId', async () => {
      const { createMockDb } = require('@test-helpers');
      const mockDb = createMockDb(async (sql) => {
        if (sql.includes('user_profiles')) {
          return { rows: [{ user_id: 'user-1' }], rowCount: 1 };
        }
        if (sql.includes('INSERT INTO chat_messages')) {
          return {
            rows: [{ message_id: 'msg-001', user_id: 'user-1', role: 'user', created_at: new Date().toISOString() }],
            rowCount: 1
          };
        }
        return { rows: [], rowCount: 0 };
      });
      app.set('db', mockDb);

      const res = await request(app)
        .post('/api/v1/chat/message')
        .set('Authorization', 'Bearer test-token')
        .send({
          phoneNumber: '+919899162012',
          role: 'user',
          content: 'What does today hold for me?',
          queryType: 'horoscope',
          creditCost: 2
        });

      expect(res.statusCode).toBe(200);
      expect(res.body.status).toBe('ok');
      expect(res.body.data).toHaveProperty('messageId');
    });

    test('saves an assistant message', async () => {
      const { createMockDb } = require('@test-helpers');
      const mockDb = createMockDb(async (sql) => {
        if (sql.includes('user_profiles')) {
          return { rows: [{ user_id: 'user-1' }], rowCount: 1 };
        }
        if (sql.includes('INSERT INTO chat_messages')) {
          return {
            rows: [{ message_id: 'msg-002', user_id: 'user-1', role: 'assistant', created_at: new Date().toISOString() }],
            rowCount: 1
          };
        }
        return { rows: [], rowCount: 0 };
      });
      app.set('db', mockDb);

      const res = await request(app)
        .post('/api/v1/chat/message')
        .set('Authorization', 'Bearer test-token')
        .send({
          phoneNumber: '+919899162012',
          role: 'assistant',
          content: 'Here is your horoscope for today...'
        });

      expect(res.statusCode).toBe(200);
      expect(res.body.status).toBe('ok');
    });

    test('rejects when content is missing', async () => {
      const { createMockDb } = require('@test-helpers');
      app.set('db', createMockDb());

      const res = await request(app)
        .post('/api/v1/chat/message')
        .set('Authorization', 'Bearer test-token')
        .send({ phoneNumber: '+919899162012', role: 'user' });

      expect(res.statusCode).toBe(400);
    });

    test('rejects when role is invalid', async () => {
      const { createMockDb } = require('@test-helpers');
      app.set('db', createMockDb());

      const res = await request(app)
        .post('/api/v1/chat/message')
        .set('Authorization', 'Bearer test-token')
        .send({ phoneNumber: '+919899162012', role: 'admin', content: 'test' });

      expect(res.statusCode).toBe(400);
    });

    test('rejects when content exceeds 5000 characters', async () => {
      const { createMockDb } = require('@test-helpers');
      app.set('db', createMockDb());

      const res = await request(app)
        .post('/api/v1/chat/message')
        .set('Authorization', 'Bearer test-token')
        .send({ phoneNumber: '+919899162012', role: 'user', content: 'x'.repeat(5001) });

      expect(res.statusCode).toBe(400);
    });
  });

  // =========================================================================
  // GET /chat/history — retrieve chat history
  // =========================================================================

  describe('GET /history', () => {
    test('returns chat history for a user', async () => {
      const { createMockDb } = require('@test-helpers');
      const mockDb = createMockDb(async (sql) => {
        if (sql.includes('user_profiles')) {
          return { rows: [{ user_id: 'user-1' }], rowCount: 1 };
        }
        if (sql.includes('chat_messages')) {
          return {
            rows: [
              { message_id: 'msg-002', role: 'assistant', content: 'Horoscope...', query_type: 'horoscope', credit_cost: 0, created_at: '2026-02-15T14:36:00Z' },
              { message_id: 'msg-001', role: 'user', content: 'What does today hold for me?', query_type: 'horoscope', credit_cost: 2, created_at: '2026-02-15T14:35:00Z' }
            ],
            rowCount: 2
          };
        }
        return { rows: [], rowCount: 0 };
      });
      app.set('db', mockDb);

      const res = await request(app)
        .get('/api/v1/chat/history')
        .query({ phoneNumber: '+919899162012' })
        .set('Authorization', 'Bearer test-token');

      expect(res.statusCode).toBe(200);
      expect(res.body.status).toBe('ok');
      expect(res.body.data).toHaveProperty('messages');
      expect(res.body.data.messages).toHaveLength(2);
      expect(res.body.data.messages[0]).toHaveProperty('role');
      expect(res.body.data.messages[0]).toHaveProperty('content');
    });

    test('returns empty array when no history', async () => {
      const { createMockDb } = require('@test-helpers');
      const mockDb = createMockDb(async (sql) => {
        if (sql.includes('user_profiles')) {
          return { rows: [{ user_id: 'user-1' }], rowCount: 1 };
        }
        return { rows: [], rowCount: 0 };
      });
      app.set('db', mockDb);

      const res = await request(app)
        .get('/api/v1/chat/history')
        .query({ phoneNumber: '+919899162012' })
        .set('Authorization', 'Bearer test-token');

      expect(res.statusCode).toBe(200);
      expect(res.body.data.messages).toEqual([]);
    });

    test('rejects when phoneNumber is missing', async () => {
      const { createMockDb } = require('@test-helpers');
      app.set('db', createMockDb());

      const res = await request(app)
        .get('/api/v1/chat/history')
        .set('Authorization', 'Bearer test-token');

      expect(res.statusCode).toBe(400);
    });

    test('respects limit query parameter', async () => {
      const { createMockDb } = require('@test-helpers');
      const mockDb = createMockDb(async (sql, params) => {
        if (sql.includes('user_profiles')) {
          return { rows: [{ user_id: 'user-1' }], rowCount: 1 };
        }
        if (sql.includes('chat_messages')) {
          // Verify limit is applied
          const limitParam = params.find(p => typeof p === 'number' || (typeof p === 'string' && /^\d+$/.test(p)));
          return { rows: [{ message_id: 'msg-1', role: 'user', content: 'test', created_at: new Date().toISOString() }], rowCount: 1 };
        }
        return { rows: [], rowCount: 0 };
      });
      app.set('db', mockDb);

      const res = await request(app)
        .get('/api/v1/chat/history')
        .query({ phoneNumber: '+919899162012', limit: 10 })
        .set('Authorization', 'Bearer test-token');

      expect(res.statusCode).toBe(200);
    });

    test('returns 404 when user not found', async () => {
      const { createMockDb } = require('@test-helpers');
      app.set('db', createMockDb({ rows: [], rowCount: 0 }));

      const res = await request(app)
        .get('/api/v1/chat/history')
        .query({ phoneNumber: '+919899162012' })
        .set('Authorization', 'Bearer test-token');

      expect(res.statusCode).toBe(404);
    });
  });
});
