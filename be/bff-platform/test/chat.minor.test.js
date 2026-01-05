const request = require('supertest');

describe('Chat BFF minor protection', () => {
  let app;

  beforeEach(() => {
    jest.resetModules();

    // Minimal commons mock used by app/router. Provide minimal config.astrology for services.
    jest.mock('../../commons', () => {
      const express = require('express');
      return {
        logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
        sanitize: (v) => v,
        ErrorCodes: { VALIDATION_ERROR: 'VALIDATION_ERROR', MISSING_REQUIRED_FIELD: 'MISSING_REQUIRED_FIELD', INVALID_INPUT: 'INVALID_INPUT', INTERNAL_SERVER_ERROR: 'INTERNAL_SERVER_ERROR' },
        // attachResponseHelpers is used as middleware
        attachResponseHelpers: (req, res, next) => {
          res.sendSuccess = (data) => res.status(200).json({ status: 'ok', data });
          res.sendError = (code, message, extra) => res.status(400).json({ status: 'error', code, message, extra });
          next();
        },
        authenticateOrReject: (req, res, next) => next(),
        createTelemetryRouter: (opts) => express.Router(),
        registerShutdown: () => {},
        config: { astrology: { baseUrl: 'http://localhost:9999' }, payment: { payment_amount_inr: 500, qrUrl: null }, n8n: { webhookUrl: null } }
      };
    });

    // Require the actual app instance exported by src/index.js
    app = require('../src/index');
  });

  afterEach(() => jest.restoreAllMocks());

  test('blocks profile persistence and forwarding for minors', async () => {
    // Provide a DOB that makes the user clearly a minor
    const payload = {
      message: 'Hi Niyati',
      sessionId: 'user-123',
      metadata: { dateOfBirth: '2010-01-01', reqId: 'r-1' }
    };

    // Mock DB that would throw if called (we expect no upsert)
    const mockDb = { query: jest.fn(() => { throw new Error('DB should not be called for minors'); }) };
    app.set('db', mockDb);

    const res = await request(app).post('/api/v1/chat').send(payload);
    // helpful debug output when failing
    if (res.statusCode !== 200) console.error('chat.minor test response:', res.statusCode, JSON.stringify(res.body));
    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.data).toHaveProperty('blockedMinor', true);
    expect(res.body.data.message).toMatch(/under 18/);
    expect(mockDb.query).not.toHaveBeenCalled();
  });
});
