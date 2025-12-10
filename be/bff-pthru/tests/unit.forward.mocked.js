const axios = require('axios');
const app = require('../src/index');
const request = require('supertest');

jest.mock('axios');

describe('unit: forwarding via axios', () => {
  beforeAll(() => {
    process.env.N8N_WEBHOOK_URL = 'http://n8n.test/webhook';
  });

  afterEach(() => jest.resetAllMocks());

  test('sends headers and body to n8n and returns response', async () => {
    axios.post.mockResolvedValue({ status: 200, data: { ok: true } });

    const res = await request(app)
      .post('/api/v1/chat')
      .send({ message: 'hi' })
      .set('Authorization', 'Bearer token-abc');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
    expect(axios.post).toHaveBeenCalledWith(
      process.env.N8N_WEBHOOK_URL,
      { message: 'hi' },
      expect.objectContaining({ headers: expect.objectContaining({ authorization: 'Bearer token-abc' }) })
    );
  });
});
