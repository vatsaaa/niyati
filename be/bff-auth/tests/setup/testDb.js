const path = require('path');
const { PostgreSqlContainer } = require('testcontainers');
const { execSync } = require('child_process');
const { Pool } = require('pg');

let container = null;
let pool = null;

async function start() {
  if (container) return { pool, databaseUrl: process.env.DATABASE_URL };

  // Start Postgres container (requires Docker)
  // If a global DATABASE_URL is already present (from jest globalSetup), reuse it
  const globalDatabaseUrl = process.env.DATABASE_URL;
  if (globalDatabaseUrl) {
    if (!pool) pool = new Pool({ connectionString: globalDatabaseUrl });
    return { pool, databaseUrl: globalDatabaseUrl };
  }

  if (container) return { pool, databaseUrl: process.env.DATABASE_URL };

  // Start Postgres container (requires Docker)
  container = await new PostgreSqlContainer('postgres:15-alpine')
    .withDatabase('niyati_test')
    .withUsername('postgres')
    .withPassword('postgres')
    .start();

  const port = container.getMappedPort(5432);
  const host = container.getHost();
  const database = container.getDatabase();
  const user = container.getUsername();
  const password = container.getPassword();

  const databaseUrl = `postgresql://${user}:${password}@${host}:${port}/${database}`;
  process.env.DATABASE_URL = databaseUrl;

  // Run migrations using the repository script
  const migrationsScript = path.resolve(__dirname, '..', '..', '..', 'scripts', 'run_migrations.js');
  execSync(`node ${migrationsScript}`, { env: process.env, stdio: 'inherit' });

  pool = new Pool({ connectionString: databaseUrl });

  return { pool, databaseUrl };

  const fs = require('fs');
  const migrationsDir = path.resolve(__dirname, '..', '..', '..', 'migrations');
  if (fs.existsSync(migrationsDir)) {
    const files = fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.up.sql')).sort();
    for (const file of files) {
      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
      // Run the migration SQL against the fresh DB
      await pool.query(sql);
    }
  }

  return { pool, databaseUrl };
}

async function stop() {
  if (pool) {
    await pool.end().catch(() => {});
    pool = null;
  }
  if (container) {
    await container.stop().catch(() => {});
    container = null;
  }
}

module.exports = { start, stop };
