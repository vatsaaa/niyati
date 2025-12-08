#!/usr/bin/env node
/*
Node-based migration runner for test/dev Postgres.
Usage: set `DATABASE_URL` env var or rely on default `postgresql://postgres:postgres@localhost:5432/niyati_test`
This script will:
 - wait for Postgres to accept connections (retries with backoff)
 - create a `migrations` table if missing
 - apply SQL files from `../migrations/` in lexical order, skipping already-applied files
*/

const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

const DEFAULT_DATABASE_URL = 'postgresql://postgres:postgres@localhost:5432/niyati_test';
const DATABASE_URL = process.env.DATABASE_URL || DEFAULT_DATABASE_URL;
const MIGRATIONS_DIR = path.join(__dirname, '..', 'migrations');

async function waitForDb(client, attempts = 30, delayMs = 1000) {
  for (let i = 0; i < attempts; i++) {
    try {
      await client.connect();
      return;
    } catch (err) {
      if (i === attempts - 1) throw err;
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
}

function listSqlFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.up.sql'))
    .sort();
}

async function ensureMigrationsTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS migrations (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
}

async function hasMigrationApplied(client, name) {
  const res = await client.query('SELECT 1 FROM migrations WHERE name = $1 LIMIT 1', [name]);
  return res.rowCount > 0;
}

async function applyMigration(client, name, sql) {
  await client.query('BEGIN');
  try {
    await client.query(sql);
    await client.query('INSERT INTO migrations (name) VALUES ($1)', [name]);
    await client.query('COMMIT');
    console.log(`applied: ${name}`);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  }
}

async function run() {
  console.log('DATABASE_URL=', DATABASE_URL.replace(/:(?:[^:@]+)@/, ':*****@'));
  const client = new Client({ connectionString: DATABASE_URL });

  try {
    console.log('Waiting for database to be ready...');
    await waitForDb(client);
    console.log('Connected to database');

    // ensure migrations table exists and use client for queries
    await ensureMigrationsTable(client);

    const files = listSqlFiles(MIGRATIONS_DIR);
    if (files.length === 0) {
      console.log('No migration files found in', MIGRATIONS_DIR);
      await client.end();
      process.exit(0);
    }

    for (const file of files) {
      const applied = await hasMigrationApplied(client, file);
      if (applied) {
        console.log(`skipping (applied): ${file}`);
        continue;
      }

      const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
      console.log(`applying: ${file}`);
      await applyMigration(client, file, sql);
    }

    console.log('Migrations complete');
    await client.end();
    process.exit(0);
  } catch (err) {
    console.error('Migration failed:', err && err.message ? err.message : err);
    try {
      await client.end();
    } catch (e) {
      // ignore
    }
    process.exit(1);
  }
}

if (require.main === module) {
  run();
}
