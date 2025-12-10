const request = require('supertest');
const nock = require('nock');
const app = require('../src/index');

describe('POST /api/v1/chat (integration with nock)', () => {
  const N8N = 'http://n8n.test';

  beforeAll(() => {
    process.env.N8N_WEBHOOK_URL = `${N8N}/webhook/chat`;
    process.env.N8N_TOKEN = 'test-token';
  });

  afterEach(() => nock.cleanAll());

  test('forwards request to n8n and returns response', async () => {
    const scope = nock(N8N)
      .post('/webhook/chat', { message: 'hello' })
      .reply(200, { reply: 'hi' });

    const res = await request(app)
      .post('/api/v1/chat')
      .send({ message: 'hello' })
      .set('Accept', 'application/json');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ reply: 'hi' });
    expect(scope.isDone()).toBe(true);
  });

  test('returns 502 when N8N not configured', async () => {
    delete process.env.N8N_WEBHOOK_URL;
    const res = await request(app).post('/api/v1/chat').send({});
    expect(res.status).toBe(502);
    process.env.N8N_WEBHOOK_URL = `${N8N}/webhook/chat`;
  });
});
