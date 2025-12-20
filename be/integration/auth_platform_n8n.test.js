const express = require('express');
const axios = require('axios');
const request = require('supertest');

describe('integration: bff-auth -> bff-platform -> n8n stub', () => {
  let platformApp, platformServer;
  let authApp, authServer;
  let n8nApp, n8nServer;
  let capturedN8n = null;

  beforeAll(async () => {
    jest.resetModules();

    // Fake DB for platform: respond to lookup (no user) and sync (return created user)
    const fakeDb = {
      async query(sql, params) {
        const s = (sql || '').toLowerCase();
        if (s.includes('select') && s.includes('from users')) {
          // lookup: return no rows to simulate new user
          return { rows: [], rowCount: 0 };
        }
        if (s.includes('insert into users') || s.includes('on conflict')) {
          // sync/upsert: return created user row
          return { rows: [{ id: 99, phone_number: params[0], last_login_location: params[10] }], rowCount: 1 };
        }
        // default
        return { rows: [], rowCount: 0 };
      }
    };

    // Start bff-platform app (importing src index) and attach fake DB
    process.env.NODE_ENV = 'test';
    platformApp = require('../bff-platform/src/index');
    platformApp.set('db', fakeDb);
    await new Promise((resolve) => { platformServer = platformApp.listen(0, resolve); });
    const pPort = platformServer.address().port;
    const platformBase = `http://127.0.0.1:${pPort}/api/v1`;

    // Start a simple n8n stub to capture payloads
    n8nApp = express();
    n8nApp.use(express.json());
    n8nApp.post('/webhook/chat', (req, res) => {
      capturedN8n = req.body;
      res.json({ status: 'ok', output: 'stubbed n8n response' });
    });
    await new Promise((resolve) => { n8nServer = n8nApp.listen(0, resolve); });
    const n8nPort = n8nServer.address().port;
    const n8nUrl = `http://127.0.0.1:${n8nPort}/webhook/chat`;

    // Start bff-auth app (mount router) — reuse pattern from unit tests
    const commons = require('../commons');
    const { attachResponseHelpers } = require('../commons/lib/responses');
    const usersRouter = require('../bff-auth/lib/users');
    authApp = express();
    authApp.use(express.json());
    authApp.use('/api/v1/users', attachResponseHelpers, usersRouter);
    await new Promise((resolve) => { authServer = authApp.listen(0, resolve); });

    // Configure bff-auth to call the started bff-platform and have n8n URL available for client simulation
    process.env.BFF_PLATFORM_BASE = platformBase;
    process.env.N8N_WEBHOOK_URL = n8nUrl;
  });

  afterAll(async () => {
    if (platformServer) await new Promise(r => platformServer.close(r));
    if (authServer) await new Promise(r => authServer.close(r));
    if (n8nServer) await new Promise(r => n8nServer.close(r));
  });

  test('profile POST to bff-auth forwards to bff-platform and allows n8n payload posting', async () => {
    const payload = { phoneNumber: '+919000000000', consentGiven: true, last_login_location: 'Mumbai' };

    // Call bff-auth profile endpoint which should forward to bff-platform sync
    const authPort = authServer.address().port;
    const res = await request(`http://127.0.0.1:${authPort}`)
      .post('/api/v1/users/profile')
      .send(payload);

    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.data).toHaveProperty('user');
    expect(res.body.data.user).toHaveProperty('last_login_location', 'Mumbai');

    // Simulate UI posting to n8n about locationChanged (client constructs payload)
    const clientPayload = {
      phoneNumber: payload.phoneNumber,
      last_login_location: 'Mumbai',
      previous_last_login_location: null,
      locationChanged: true
    };

    // Post to n8n stub
    const n8nResp = await axios.post(process.env.N8N_WEBHOOK_URL, clientPayload);
    expect(n8nResp.status).toBe(200);
    expect(capturedN8n).toBeTruthy();
    expect(capturedN8n).toHaveProperty('phoneNumber', payload.phoneNumber);
    expect(capturedN8n).toHaveProperty('locationChanged', true);
  });
});
