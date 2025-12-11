const request = require('supertest');
const express = require('express');

// Use the real commons utilities
const commons = require('../../../commons');

describe('bff-platform - astrology routes', () => {
  let app;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use(commons.attachResponseHelpers);
    const astrologyRouter = require('../../lib/astrology');
    app.use('/api/astrology', astrologyRouter);
  });

  afterAll(() => {
    // Close any caches/intervals created by services to avoid Jest open-handle warnings
    try {
      const astrologyService = require('../../services/astrologyService');
      if (astrologyService && astrologyService._cache && typeof astrologyService._cache.close === 'function') {
        astrologyService._cache.close();
      }
    } catch (e) {
      // ignore
    }
  });

  test('POST /api/astrology/compute missing fields returns MISSING_REQUIRED_FIELD', async () => {
    const res = await request(app).post('/api/astrology/compute').send({});
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
    expect(res.body.error.code).toBe(commons.ErrorCodes.MISSING_REQUIRED_FIELD);
  });

  test('POST /api/astrology/planets with incomplete payload returns PROVIDER_ERROR (validation)', async () => {
    const res = await request(app).post('/api/astrology/planets').send({});
    // In test env, the service validates and throws missing_profile_fields -> route returns PROVIDER_ERROR
    expect(res.status).toBe(502);
    expect(res.body).toHaveProperty('error');
    expect(res.body.error.code).toBe(commons.ErrorCodes.PROVIDER_ERROR);
  });

  test('POST /api/astrology/planets with valid payload returns ok', async () => {
    const payload = { year: 1990, month: 11, date: 23, lat: 18.5204, lon: 73.8567 };
    const res = await request(app).post('/api/astrology/planets').send(payload);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('status');
    expect(res.body.status).toBe('ok');
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBeGreaterThan(0);
  });
});
