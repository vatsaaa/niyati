const express = require('express');
const http = require('http');
const { Pool } = require('pg');
const fetch = require('node-fetch');
const { PostgreSqlContainer } = require('testcontainers');

const commons = require('../../../commons');

jest.setTimeout(120000);

describe('Full flow integration (testcontainers)', () => {
  let container;
  let pool;
  let platformServer;
  let authServer;
  let platformUrl;
  let authUrl;

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:15')
      .withDatabase('niyati_test')
      .withUsername('postgres')
      .withPassword('postgres')
      .start();

    const host = container.getHost();
    const port = container.getMappedPort(5432);
    const connectionString = `postgresql://postgres:postgres@${host}:${port}/niyati_test`;

    pool = new Pool({ connectionString });

    // create users table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        phone_number TEXT UNIQUE,
        date_of_birth TEXT,
        time_of_birth TEXT,
        place_of_birth TEXT,
        lat DOUBLE PRECISION,
        lon DOUBLE PRECISION,
        timezone TEXT,
        consent_given BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT now(),
        updated_at TIMESTAMP DEFAULT now()
      );
    `);

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

    // Start auth app (which will call platformUrl)
    const authApp = express();
    authApp.use(express.json());
    authApp.use(commons.attachResponseHelpers);
    // set BFF_PLATFORM_BASE for axios calls inside router
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
    try { await container.stop(); } catch (e) {}
  });

  test('new user is synced via auth->platform and stored in DB', async () => {
    const profile = {
      phoneNumber: '+91-7777777777',
      dateOfBirth: '1995-05-05',
      timeOfBirth: '09:00',
      placeOfBirth: 'Mumbai',
      lat: 19.07,
      lon: 72.88,
      timezone: 'Asia/Kolkata',
      consentGiven: true
    };

    const res = await fetch(`${authUrl}/api/v1/users/profile`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(profile)
    });
    const payload = await res.json();
    expect(res.status).toBe(200);
    expect(payload.status).toBe('ok');
    expect(payload.data.created).toBe(true);

    // verify DB row exists
    const r = await pool.query('SELECT phone_number FROM users WHERE phone_number=$1', [profile.phoneNumber]);
    expect(r.rows.length).toBe(1);
  });

  test('existing user is detected and not re-synced', async () => {
    const profile = { phoneNumber: '+91-7777777777', consentGiven: true };
    const res = await fetch(`${authUrl}/api/v1/users/profile`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(profile)
    });
    const payload = await res.json();
    expect(res.status).toBe(200);
    expect(payload.status).toBe('ok');
    expect(payload.data.created).toBe(false);
  });
});
