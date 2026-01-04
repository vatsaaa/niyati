const request = require('supertest');
const { createTestApp } = require('@test-helpers');

describe('POST /chat/classify', () => {
  let app;

  beforeEach(() => {
    jest.resetModules();
    // Inline mock similar to other route tests
    jest.mock('../commons', () => {
      const responses = require('../../commons/lib/responses');
      return {
        logger: { warn: jest.fn(), error: jest.fn(), info: jest.fn() },
        sanitize: v => v,
        ErrorCodes: responses.ErrorCodes,
        config: {}
      };
    });

    const chatRouter = require('../lib/chat');
    const { app: testApp } = createTestApp('/api/v1/chat', chatRouter);
    app = testApp;
  });

  afterEach(() => jest.restoreAllMocks());

  test('returns error when message missing', async () => {
    const res = await request(app).post('/api/v1/chat/classify').send({});
    expect(res.statusCode).toBe(400);
    expect(res.body.status).toBe('error');
    expect(res.body.error).toBeDefined();
  });

  test('classifies horoscope and premium correctly', async () => {
    const res1 = await request(app).post('/api/v1/chat/classify').send({ message: "How is my day today?" });
    expect(res1.statusCode).toBe(200);
    expect(res1.body.status).toBe('ok');
    expect(res1.body.data.queryType).toBe('horoscope');
    expect(res1.body.data.creditCost).toBe(2);

    const res2 = await request(app).post('/api/v1/chat/classify').send({ message: 'When will I get married?' });
    expect(res2.statusCode).toBe(200);
    expect(res2.body.status).toBe('ok');
    expect(res2.body.data.queryType).toBe('premium');
    expect(res2.body.data.creditCost).toBe(4);
  });
});
