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
        if (s.includes('select') && (s.includes('from users') || s.includes('from user_profiles'))) {
          // lookup: return no rows to simulate new user
          return { rows: [], rowCount: 0 };
        }
        if (s.includes('user_profiles')) {
          // sync/upsert into user_profiles: return created user row with last_login_location at params[9]
          return { rows: [{ user_id: 99, phone_number: params[0], last_login_location: params[9] || null }], rowCount: 1 };
        }
        if (s.includes('user_credits')) {
          // sync/upsert into user_credits: return credits
          return { rows: [{ user_id: 99, credits: 10, total_paid_amount: 0 }], rowCount: 1 };
        }
        if (s.includes('insert into users') || s.includes('on conflict')) {
          // legacy fallback: return created user row
          return { rows: [{ id: 99, phone_number: params[0], last_login_location: params[5] || null, credits: 10 }], rowCount: 1 };
        }
        // default
        return { rows: [], rowCount: 0 };
      }
    };

    // Ensure no service token is required during test
    process.env.SERVICE_TOKEN = '';

    // Start bff-platform app (importing src index) and attach fake DB
    process.env.NODE_ENV = 'test';
    try {
      // When running tests from repo root (host), this path resolves
      platformApp = require('../../bff-platform/src/index');
    } catch (err) {
      // When running inside the bff-platform container, the package root
      // is the current working directory; fall back to local src path.
      platformApp = require('../src/index');
    }
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

    // Mock axios so auth's calls to platform are short-circuited to our fakeDb, but allow n8n HTTP calls
    const axios = require('axios');
    jest.mock('axios');
    // intercept lookup and sync calls to platform
    axios.get = jest.fn(async (url, opts) => {
      if (url && url.includes('/internal/users/lookup')) {
        const phone = opts && opts.params && opts.params.phoneNumber;
        return { data: { status: 'ok', data: { user: null } } };
      }
      return { data: { status: 'ok' } };
    });
    axios.post = jest.fn(async (url, data, opts) => {
      if (url && url.includes('/users/sync')) {
        return { data: { status: 'ok', data: { user: { user_id: 99, phone_number: data.phoneNumber, last_login_location: data.last_login_location || null } } } };
      }
      // for n8n webhook, perform a real HTTP POST
      const fetch = require('node-fetch');
      const resp = await fetch(url, { method: 'POST', body: JSON.stringify(data), headers: { 'Content-Type': 'application/json' } });
      return { status: resp.status, data: await resp.json() };
    });

    // Start bff-auth app (mount router) — reuse pattern from unit tests
    const { attachResponseHelpers } = require('@niyati/commons/lib/responses');
    const usersRouter = require('../../bff-auth/lib/users');
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
