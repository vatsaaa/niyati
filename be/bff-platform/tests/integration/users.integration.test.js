const request = require('supertest');
const express = require('express');
const { Pool } = require('pg');

const commons = require('../../../commons');

// Integration tests require a real DATABASE_URL env var. If not present, skip the suite.
const databaseUrl = process.env.DATABASE_URL;

(databaseUrl ? describe : describe.skip)('bff-platform - users integration (requires real Postgres)', () => {
  let app;
  let pool;

  beforeAll(async () => {
    pool = new Pool({ connectionString: databaseUrl, max: 2 });
    // Create minimal users table for tests
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

    app = express();
    app.use(express.json());
    app.use(commons.attachResponseHelpers);
    const usersRouter = require('../../lib/users');
    app.use('/api/users', usersRouter);
    app.set('db', pool);
  });

  afterAll(async () => {
    try {
      await pool.query('DROP TABLE IF EXISTS users');
    } catch (e) {
      // ignore
    }
    await pool.end();
  });

  test('POST /api/users/sync upserts and GET /lookup returns the user', async () => {
    const sampleProfile = {
      phoneNumber: '+91-8888888888',
      dateOfBirth: '1992-02-02',
      timeOfBirth: '12:00',
      placeOfBirth: 'Mumbai',
      lat: 19.0760,
      lon: 72.8777,
      timezone: 'Asia/Kolkata',
      consentGiven: true
    };

    // POST sync
    const postRes = await request(app).post('/api/users/sync').send(sampleProfile);
    expect(postRes.status).toBe(200);
    expect(postRes.body.status).toBe('ok');
    expect(postRes.body.data).toHaveProperty('user');

    // GET lookup
    const getRes = await request(app).get('/api/users/lookup').query({ phoneNumber: sampleProfile.phoneNumber });
    expect(getRes.status).toBe(200);
    expect(getRes.body.status).toBe('ok');
    expect(getRes.body.data).toHaveProperty('user');
    expect(getRes.body.data.user.phone_number).toBe(sampleProfile.phoneNumber);
  });
});
