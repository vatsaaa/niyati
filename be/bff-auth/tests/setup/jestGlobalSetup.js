const { PostgreSqlContainer } = require('testcontainers');
const fs = require('fs');
const os = require('os');
const path = require('path');

module.exports = async () => {
  // If a DATABASE_URL is provided by the environment (e.g. running inside Compose),
  // use that DB instead of starting a testcontainers Postgres instance.
  if (process.env.DATABASE_URL) {
    const databaseUrl = process.env.DATABASE_URL;
    const state = { databaseUrl };
    const tmpPath = path.join(os.tmpdir(), 'niyati_test_db.json');
    fs.writeFileSync(tmpPath, JSON.stringify(state), 'utf8');
    // Ensure child processes and required modules see the DATABASE_URL
    process.env.DATABASE_URL = databaseUrl;

    // Run migrations against the provided DATABASE_URL
    try {
      const { execSync } = require('child_process');
      const migrationsScript = path.resolve(__dirname, '..', '..', '..', 'scripts', 'run_migrations.js');
      console.log('Jest global setup: using existing DATABASE_URL, running migrations via script:', migrationsScript);

      try {
        const fallbackNodePath = path.resolve(__dirname, '..', '..', 'node_modules');
        const moduleBuiltin = require('module');
        process.env.NODE_PATH = process.env.NODE_PATH ? `${process.env.NODE_PATH}${require('path').delimiter}${fallbackNodePath}` : fallbackNodePath;
        moduleBuiltin.Module._initPaths();

        const migrationsModule = require(migrationsScript);
        if (migrationsModule && typeof migrationsModule.run === 'function') {
          await migrationsModule.run();
        } else {
          const env = { ...process.env };
          execSync(`node ${migrationsScript}`, { env, stdio: 'inherit' });
        }
      } catch (err) {
        console.error('Failed to run migrations via script in globalSetup (existing DB):', err && err.message);
        throw err;
      }

      console.log('Jest global setup: applied migrations on existing DATABASE_URL');
      return;
    } catch (err) {
      console.error('Failed to run migrations via script in globalSetup (existing DB):', err && err.message);
      throw err;
    }
  }

  // Start a shared Postgres container for the entire Jest run
  // Build container and set a label if supported by this testcontainers version
  const containerBuilder = new PostgreSqlContainer('postgres:15-alpine')
    .withDatabase('niyati_test')
    .withUsername('postgres')
    .withPassword('postgres');

  if (typeof containerBuilder.withLabel === 'function') {
    containerBuilder.withLabel('niyati_test', '1');
  }

  const container = await containerBuilder.start();

  const host = container.getHost();
  const port = container.getMappedPort(5432);
  const database = container.getDatabase();
  const user = container.getUsername();
  const password = container.getPassword();

  const databaseUrl = `postgresql://${user}:${password}@${host}:${port}/${database}`;

  // Persist connection info to a temp file for tests and teardown
  const state = { databaseUrl };
  const tmpPath = path.join(os.tmpdir(), 'niyati_test_db.json');
  fs.writeFileSync(tmpPath, JSON.stringify(state), 'utf8');
  // Ensure child processes and required modules see the container DATABASE_URL
  process.env.DATABASE_URL = databaseUrl;
  // Run the repository migration runner script so migrations are applied using the same logic
  try {
    const { execSync } = require('child_process');
    const migrationsScript = path.resolve(__dirname, '..', '..', '..', 'scripts', 'run_migrations.js');
    console.log('Running migrations via script:', migrationsScript);

    // Prefer requiring and invoking the run() function exported by the script.
    // To ensure the module can resolve dependencies like `pg` installed under `be/bff-auth/node_modules`,
    // add that path to NODE_PATH and reinitialize module paths before requiring.
    try {
      const fallbackNodePath = path.resolve(__dirname, '..', '..', 'node_modules');
      const moduleBuiltin = require('module');
      process.env.NODE_PATH = process.env.NODE_PATH ? `${process.env.NODE_PATH}${require('path').delimiter}${fallbackNodePath}` : fallbackNodePath;
      // Reinitialize Node's module search paths so `require` honors the updated NODE_PATH
      moduleBuiltin.Module._initPaths();

      const migrationsModule = require(migrationsScript);
      if (migrationsModule && typeof migrationsModule.run === 'function') {
        await migrationsModule.run();
      } else {
        // Fallback: run as a child process
        const env = { ...process.env };
        execSync(`node ${migrationsScript}`, { env, stdio: 'inherit' });
      }
    } catch (err) {
      console.error('Failed to run migrations via script in globalSetup:', err && err.message);
      throw err;
    }
  } catch (err) {
    console.error('Failed to run migrations via script in globalSetup:', err && err.message);
    throw err;
  }

  console.log('Jest global setup: started Postgres container and applied migrations');
};
