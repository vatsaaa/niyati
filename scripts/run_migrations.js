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
const MIGRATIONS_DIR = path.join(__dirname, '..', 'packages', 'migrations');

async function waitForDb(connectionString, attempts = 30, delayMs = 1000) {
  for (let i = 0; i < attempts; i++) {
    const tryClient = new Client({ connectionString });
    try {
      await tryClient.connect();
      await tryClient.end();
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
    const enhancedErr = new Error(`Migration "${name}" failed: ${err.message}`);
    enhancedErr.migration = name;
    enhancedErr.originalError = err;
    enhancedErr.position = err.position;
    throw enhancedErr;
  }
}

async function run() {
  console.log('DATABASE_URL=', DATABASE_URL.replace(/:(?:[^:@]+)@/, ':*****@'));
  const client = new Client({ connectionString: DATABASE_URL });

  try {
    console.log('Waiting for database to be ready...');
    await waitForDb(DATABASE_URL);
    await client.connect();
    console.log('Connected to database');

    await ensureMigrationsTable(client);

    const files = listSqlFiles(MIGRATIONS_DIR);
    if (files.length === 0) {
      console.log('No migration files found in', MIGRATIONS_DIR);
      await client.end();
      return { applied: 0 };
    }

    let appliedCount = 0;
    for (const file of files) {
      const applied = await hasMigrationApplied(client, file);
      if (applied) {
        console.log(`skipping (applied): ${file}`);
        continue;
      }

      const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
      console.log(`applying: ${file}`);
      await applyMigration(client, file, sql);
      appliedCount++;
    }

    console.log(`Migrations complete. Applied ${appliedCount} new migration(s).`);
    await client.end();
    return { applied: appliedCount, total: files.length };
  } catch (err) {
    console.error('Migration failed:', err && err.message ? err.message : err);
    if (err.position) {
      console.error(`SQL error at position: ${err.position}`);
    }
    try {
      await client.end();
    } catch (e) {}
    throw err;
  }
}

async function status() {
  console.log('DATABASE_URL=', DATABASE_URL.replace(/:(?:[^:@]+)@/, ':*****@'));
  const client = new Client({ connectionString: DATABASE_URL });

  try {
    await waitForDb(DATABASE_URL);
    await client.connect();
    await ensureMigrationsTable(client);

    const files = listSqlFiles(MIGRATIONS_DIR);
    const appliedRes = await client.query('SELECT name, applied_at FROM migrations ORDER BY applied_at');
    const appliedSet = new Set(appliedRes.rows.map(r => r.name));

    console.log('\nMigration Status:');
    console.log('=================');
    
    for (const file of files) {
      const isApplied = appliedSet.has(file);
      const row = appliedRes.rows.find(r => r.name === file);
      const appliedAt = row ? new Date(row.applied_at).toISOString() : '';
      console.log(`  ${isApplied ? '✓' : '○'} ${file}${appliedAt ? ` (applied: ${appliedAt})` : ''}`);
    }

    for (const row of appliedRes.rows) {
      if (!files.includes(row.name)) {
        console.log(`  ⚠ ${row.name} (applied but file missing!)`);
      }
    }

    const pending = files.filter(f => !appliedSet.has(f));
    console.log(`\nTotal: ${files.length} migrations, ${appliedSet.size} applied, ${pending.length} pending`);

    await client.end();
    return { total: files.length, applied: appliedSet.size, pending: pending.length };
  } catch (err) {
    console.error('Status check failed:', err && err.message ? err.message : err);
    try { await client.end(); } catch (e) {}
    throw err;
  }
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const command = args[0] || 'run';

  if (command === '--status' || command === 'status') {
    status()
      .then(() => process.exit(0))
      .catch(() => process.exit(1));
  } else {
    run()
      .then(() => process.exit(0))
      .catch(() => process.exit(1));
  }
}

module.exports = { run, status };
