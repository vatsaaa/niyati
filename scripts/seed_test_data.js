#!/usr/bin/env node
/*
Simple test data seeder for the BFF test database.
Inserts a test user (if missing) and a refresh token for integration tests.
Usage: set `DATABASE_URL` env var or rely on default `postgresql://postgres:postgres@localhost:5432/niyati_test`
*/

const { Client } = require('pg');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/niyati_test';

async function run() {
  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();
  try {
    // Ensure users table exists
    const testEmail = 'test@local';
    const res = await client.query('SELECT id FROM users WHERE lower(email) = lower($1) LIMIT 1', [testEmail]);
    let userId;
    if (res.rowCount > 0) {
      userId = res.rows[0].id;
      console.log('Test user already exists:', userId);
    } else {
      const password = 'password';
      const hash = await bcrypt.hash(password, 10);
      const insert = await client.query(
        'INSERT INTO users (email, password_hash, name) VALUES ($1, $2, $3) RETURNING id',
        [testEmail, hash, 'Test User']
      );
      userId = insert.rows[0].id;
      console.log('Inserted test user:', userId);
    }

    // Insert a refresh token for the user
    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 30); // 30 days

    const existing = await client.query('SELECT id FROM refresh_tokens WHERE user_id = $1 LIMIT 1', [userId]);
    if (existing.rowCount > 0) {
      console.log('Refresh token already exists for user, skipping insert');
    } else {
      await client.query(
        'INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)',
        [userId, tokenHash, expiresAt]
      );
      console.log('Inserted refresh token for user. raw token (store this if needed):', rawToken);
    }

    console.log('Seeding complete');
  } catch (err) {
    console.error('Seeding failed:', err && err.message ? err.message : err);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

if (require.main === module) run();
