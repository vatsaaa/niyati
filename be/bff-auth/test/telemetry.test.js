const request = require('supertest');
const express = require('express');

describe('bff-auth telemetry routes', () => {
  let app;

  beforeEach(() => {
    jest.resetModules();
    jest.mock('../commons/lib/logger', () => ({ logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }, reqIdFromReq: () => null }));
    jest.mock('../commons/lib/sanitize', () => ({ sanitize: v => v }));
    jest.mock('../commons/config', () => ({ server: { apiVersion: '1.0' }, env: 'test' }));

    const router = require('../lib/telemetry');
    app = express();
    app.use(express.json());
    const { attachResponseHelpers } = require('../../commons/lib/responses');
    app.use('/api/telemetry', attachResponseHelpers, router);
  });

  afterEach(() => jest.restoreAllMocks());

  test('POST /log accepts valid message', async () => {
    const res = await request(app).post('/api/telemetry/log').send({ level: 'debug', message: 'hi' });
    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe('ok');
  });

  test('POST /log rejects missing message', async () => {
    const res = await request(app).post('/api/telemetry/log').send({ level: 'debug' });
    expect(res.statusCode).toBe(400);
  });

  test('GET /health returns ok', async () => {
    const res = await request(app).get('/api/telemetry/health');
    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe('ok');
  });
});
