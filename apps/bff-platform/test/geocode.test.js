const request = require('supertest');
const express = require('express');

describe('geocode routes', () => {
  let app;

  beforeEach(() => {
    jest.resetModules();

    // Mock commons with response helpers
    jest.mock('@niyati/commons', () => {
      const responses = require('@niyati/commons/lib/responses');
      return {
        logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn(), fatal: jest.fn(), trace: jest.fn(),  debug: jest.fn(), error: jest.fn() },
        sanitize: v => v,
        reqIdFromReq: () => null,
        ErrorCodes: responses.ErrorCodes,
        config: { geocode: { baseUrl: 'https://maps.co', timeout: 1000 } }
      };
    });

    // Mock geocodeService
    jest.mock('../services/geocodeService', () => ({
      search: async (q) => ({ status: 'ok', data: [{ name: q }] }),
      reverse: async (lat, lon) => ({ status: 'ok', data: { lat, lon } }),
      lookup: async (ids) => ({ status: 'ok', data: { ids } }),
      structuredSearch: async (params) => ({ status: 'ok', data: params }),
      callMapsCo: async (path, query) => ({ results: [query] }),
      getCurrentLocation: async () => ({ status: 'ok', data: { city: 'Test' } })
    }));

    const router = require('../lib/geocode');
    app = express();
    app.use(express.json());
    const { attachResponseHelpers } = require('@niyati/commons/lib/responses');
    app.use('/api/v1/geocode', attachResponseHelpers, router);
  });

  afterEach(() => jest.restoreAllMocks());

  test('POST / returns results for q', async () => {
    const res = await request(app).post('/api/v1/geocode').send({ q: 'Pune' });
    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe('ok');
  });

  test('POST /reverse returns data', async () => {
    const res = await request(app).post('/api/v1/geocode/reverse').send({ lat: 1, lon: 2 });
    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe('ok');
  });

  test('GET /proxy allowed path returns ok', async () => {
    const res = await request(app).get('/api/v1/geocode/proxy/search').send();
    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe('ok');
  });
});
