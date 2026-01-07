const request = require('supertest');
const express = require('express');

describe('astrology routes', () => {
  let app;

  beforeEach(() => {
    jest.resetModules();

    jest.mock('@niyati/commons', () => {
      const responses = require('@niyati/commons/lib/responses');
      return {
        logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn(), fatal: jest.fn(), trace: jest.fn(),  info: jest.fn(), error: jest.fn() },
        sanitize: v => v,
        reqIdFromReq: () => null,
        config: { astrology: { baseUrl: 'https://astro' }, features: { probeEndpoint: true } },
        ErrorCodes: responses.ErrorCodes
      };
    });

    // Mock astrologyService
    jest.mock('../services/astrologyService', () => ({
      compute: async (profile) => ({ status: 'ok', data: profile }),
      geoDetails: async (q) => ({ status: 'ok', data: q }),
      planets: async (payload) => ({ sun: 'data' }),
      navamsa: async (payload) => ({ status: 'ok', data: payload }),
      divisional: async (n, payload) => ({ status: 'ok', n, data: payload }),
      horoscopeSvg: async (payload) => ({ status: 'ok', svg: '<svg/>' })
    }));

    const router = require('../lib/astrology');
    app = express();
    app.use(express.json());
    const { attachResponseHelpers } = require('@niyati/commons/lib/responses');
    app.use('/api/astrology', attachResponseHelpers, router);
  });

  afterEach(() => jest.restoreAllMocks());

  test('POST /compute returns provider result', async () => {
    const res = await request(app).post('/api/astrology/compute').send({ profile: { dob: '1990-01-01', placeOfBirth: { city: 'Test' } } });
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty('status');
  });

  test('POST /geo-details returns data', async () => {
    const res = await request(app).post('/api/astrology/geo-details').send({ q: 'Pune' });
    expect(res.statusCode).toBe(200);
  });

  test('POST /planets returns ok structure', async () => {
    const res = await request(app).post('/api/astrology/planets').send({ payload: { test: true } });
    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe('ok');
  });
});
