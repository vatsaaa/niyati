// @niyati/auth-core — remoteAuthMiddleware tests
const express = require('express');
const request = require('supertest');

describe('createRemoteAuthMiddleware', () => {
  let mockValidateServer;
  let validatePort;

  // Start a tiny HTTP server that mimics /auth/validate
  beforeAll((done) => {
    const app = express();
    app.use(express.json());
    app.post('/auth/validate', (req, res) => {
      const auth = req.headers.authorization || '';
      if (auth === 'Bearer valid-token') {
        return res.json({ status: 'ok', data: { user: { id: 1, name: 'Test' } } });
      }
      return res.status(401).json({ status: 'error' });
    });
    mockValidateServer = app.listen(0, () => {
      validatePort = mockValidateServer.address().port;
      done();
    });
  });

  afterAll((done) => {
    mockValidateServer.close(done);
  });

  function buildApp(middleware) {
    const app = express();
    app.use(express.json());
    app.use((req, res, next) => {
      res.sendError = (code, msg) => res.status(401).json({ status: 'error', error: { code, message: msg } });
      next();
    });
    app.get('/test', middleware, (req, res) => {
      res.json({ status: 'ok', user: req.user });
    });
    return app;
  }

  test('rejects request with no token', async () => {
    const { createRemoteAuthMiddleware } = require('../lib/remoteAuthMiddleware');
    const mw = createRemoteAuthMiddleware({
      validateUrl: `http://localhost:${validatePort}/auth/validate`,
      errorCodes: { UNAUTHORIZED: 'UNAUTHORIZED', INTERNAL_SERVER_ERROR: 'INTERNAL_SERVER_ERROR' }
    });
    const app = buildApp(mw);
    const res = await request(app).get('/test');
    expect(res.statusCode).toBe(401);
  });

  test('passes request with valid token and sets req.user', async () => {
    const { createRemoteAuthMiddleware } = require('../lib/remoteAuthMiddleware');
    const mw = createRemoteAuthMiddleware({
      validateUrl: `http://localhost:${validatePort}/auth/validate`,
      errorCodes: { UNAUTHORIZED: 'UNAUTHORIZED', INTERNAL_SERVER_ERROR: 'INTERNAL_SERVER_ERROR' }
    });
    const app = buildApp(mw);
    const res = await request(app).get('/test').set('Authorization', 'Bearer valid-token');
    expect(res.statusCode).toBe(200);
    expect(res.body.user).toHaveProperty('id', 1);
  });

  test('rejects request with invalid token', async () => {
    const { createRemoteAuthMiddleware } = require('../lib/remoteAuthMiddleware');
    const mw = createRemoteAuthMiddleware({
      validateUrl: `http://localhost:${validatePort}/auth/validate`,
      errorCodes: { UNAUTHORIZED: 'UNAUTHORIZED', INTERNAL_SERVER_ERROR: 'INTERNAL_SERVER_ERROR' }
    });
    const app = buildApp(mw);
    const res = await request(app).get('/test').set('Authorization', 'Bearer bad-token');
    expect(res.statusCode).toBe(401);
  });

  test('allows X-Service-Token bypass', async () => {
    const { createRemoteAuthMiddleware } = require('../lib/remoteAuthMiddleware');
    const mw = createRemoteAuthMiddleware({
      validateUrl: `http://localhost:${validatePort}/auth/validate`,
      serviceToken: 'my-internal-secret',
      errorCodes: { UNAUTHORIZED: 'UNAUTHORIZED', INTERNAL_SERVER_ERROR: 'INTERNAL_SERVER_ERROR' }
    });
    const app = buildApp(mw);
    const res = await request(app).get('/test').set('X-Service-Token', 'my-internal-secret');
    expect(res.statusCode).toBe(200);
    expect(res.body.user).toHaveProperty('service', 'internal');
  });

  test('accepts injectable logger', async () => {
    const { createRemoteAuthMiddleware } = require('../lib/remoteAuthMiddleware');
    const logs = [];
    const customLogger = {
      info: (...a) => logs.push(a),
      warn: (...a) => logs.push(a),
      error: (...a) => logs.push(a)
    };
    const mw = createRemoteAuthMiddleware({
      validateUrl: `http://localhost:${validatePort}/auth/validate`,
      errorCodes: { UNAUTHORIZED: 'UNAUTHORIZED', INTERNAL_SERVER_ERROR: 'INTERNAL_SERVER_ERROR' },
      logger: customLogger
    });
    const app = buildApp(mw);
    // Use a bad token so the remote validate call fails and triggers logger.warn
    await request(app).get('/test').set('Authorization', 'Bearer bad-token');
    expect(logs.length).toBeGreaterThan(0);
  });

  test('cacheTtl caches validated user', async () => {
    const { createRemoteAuthMiddleware } = require('../lib/remoteAuthMiddleware');
    const mw = createRemoteAuthMiddleware({
      validateUrl: `http://localhost:${validatePort}/auth/validate`,
      errorCodes: { UNAUTHORIZED: 'UNAUTHORIZED', INTERNAL_SERVER_ERROR: 'INTERNAL_SERVER_ERROR' },
      cacheTtl: 60
    });
    const app = buildApp(mw);
    // First call — hits remote
    const res1 = await request(app).get('/test').set('Authorization', 'Bearer valid-token');
    expect(res1.statusCode).toBe(200);
    // Second call — served from cache (still valid)
    const res2 = await request(app).get('/test').set('Authorization', 'Bearer valid-token');
    expect(res2.statusCode).toBe(200);
  });
});
