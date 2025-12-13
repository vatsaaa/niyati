const express = require('express');
const http = require('http');
const { Pool } = require('pg');
const fetch = require('node-fetch');
const { execSync } = require('child_process');
const commons = require('../../../commons');

jest.setTimeout(180000);

describe('Full flow integration (docker-compose postgres)', () => {
  let pool;
  let platformServer;
  let authServer;
  let platformUrl;
  let authUrl;

  beforeAll(async () => {
    // Start docker-compose postgres service if not running
    try {
      execSync('docker compose up -d postgres', { stdio: 'inherit' });
    } catch (e) {
      // continue
    }

    // Wait for pg to be ready
    const max = 30;
    let ready = false;
    for (let i = 0; i < max; i++) {
      try {
        execSync('pg_isready -h localhost -p 5432 -U niyati -d niyati_dev');
        ready = true; break;
      } catch (e) { await new Promise(r => setTimeout(r, 1000)); }
    }
    if (!ready) throw new Error('Postgres did not become ready');

    const connectionString = 'postgresql://niyati:niyati_dev_pass@localhost:5432/niyati_dev';
    pool = new Pool({ connectionString });

    await pool.query(`CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY, phone_number TEXT UNIQUE, date_of_birth TEXT, time_of_birth TEXT, place_of_birth TEXT, lat DOUBLE PRECISION, lon DOUBLE PRECISION, timezone TEXT, consent_given BOOLEAN DEFAULT false, created_at TIMESTAMP DEFAULT now(), updated_at TIMESTAMP DEFAULT now()
    );`);

    // Start platform app
    const platformApp = express();
    platformApp.use(express.json());
    platformApp.use(commons.attachResponseHelpers);
    const platformUsers = require('../../lib/users');
    platformApp.use('/api/v1/users', platformUsers);
    platformApp.set('db', pool);

    platformServer = http.createServer(platformApp);
    await new Promise((res) => platformServer.listen(0, res));
    const pAddr = platformServer.address();
    platformUrl = `http://127.0.0.1:${pAddr.port}`;

    // Start auth app
    const authApp = express();
    authApp.use(express.json());
    authApp.use(commons.attachResponseHelpers);
    process.env.BFF_PLATFORM_BASE = platformUrl;
    const authUsers = require('../../../be/bff-auth/lib/users');
    authApp.use('/api/v1/users', authUsers);

    authServer = http.createServer(authApp);
    await new Promise((res) => authServer.listen(0, res));
    const aAddr = authServer.address();
    authUrl = `http://127.0.0.1:${aAddr.port}`;
  });

  afterAll(async () => {
    try { await platformServer.close(); } catch (e) {}
    try { await authServer.close(); } catch (e) {}
    try { await pool.end(); } catch (e) {}
    // do not tear down docker-compose here to avoid destroying developer environment
  });

  test('end-to-end new and returning user via docker-compose postgres', async () => {
    const profile = { phoneNumber: '+91-6666666666', dateOfBirth: '1991-01-01', consentGiven: true };
    const res = await fetch(`${authUrl}/api/v1/users/profile`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(profile) });
    const payload = await res.json();
    expect(res.status).toBe(200);
    expect(payload.status).toBe('ok');
    expect(payload.data.created).toBe(true);

    // Call again -> should be created:false
    const res2 = await fetch(`${authUrl}/api/v1/users/profile`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phoneNumber: profile.phoneNumber, consentGiven: true }) });
    const payload2 = await res2.json();
    expect(res2.status).toBe(200);
    expect(payload2.status).toBe('ok');
    expect(payload2.data.created).toBe(false);
  });
});
