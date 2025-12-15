/**
 * Environment validation for bff-auth
 * - export validateEnv(opts) -> { errors, warnings }
 * - export validateOrExit(opts) -> exits process when errors found
 */

function findOAuthProviders() {
  const env = process.env;
  const providers = new Set();
  Object.keys(env).forEach(k => {
    const m = k.match(/^OAUTH_([A-Z0-9_]+)_CLIENT_ID$/);
    if (m) providers.add(m[1]);
  });
  return Array.from(providers);
}

function validateChecks(opts = {}) {
  const errors = [];
  const warnings = [];
  const env = process.env;

  // Required secrets
  // Backwards-compatible required vars used in tests and runtime
  const requiredList = [
    { key: 'PORT', desc: 'Server port' },
    { key: 'ASTRO_API_URL', desc: 'Astrology provider base URL' },
    { key: 'ASTRO_API_KEY', desc: 'Astrology provider API key' },
    { key: 'ACCESS_TOKEN_SECRET', desc: 'JWT access token secret' }
  ];
  requiredList.forEach(({ key, desc }) => {
    if (!env[key] || String(env[key]).trim() === '') errors.push(`${key} (${desc}) is required`);
  });

  // Database: require unless explicitly allowed (testing or override)
  const requireDb = opts.requireDb !== undefined ? opts.requireDb : (env.NODE_ENV !== 'test' && env.BFF_AUTH_ALLOW_NO_DB !== 'true');
  if (requireDb) {
    if (!env.DATABASE_URL && !(env.PGHOST && env.PGUSER && env.PGDATABASE)) {
      errors.push('Database configuration missing: set DATABASE_URL or PGHOST/PGUSER/PGDATABASE');
    }
  } else {
    if (!env.DATABASE_URL) warnings.push('DATABASE_URL not set; DB features are disabled in this environment');
  }

  // OAuth provider sanity checks: if CLIENT_ID is set, ensure minimal config
  const providers = findOAuthProviders();
  providers.forEach(p => {
    const prefix = `OAUTH_${p}_`;
    if (!env[`${prefix}CLIENT_SECRET`]) errors.push(`${prefix}CLIENT_SECRET is required when ${prefix}CLIENT_ID is set`);
    if (!env[`${prefix}AUTHORIZE_URL`]) errors.push(`${prefix}AUTHORIZE_URL is required when ${prefix}CLIENT_ID is set`);
    if (!env[`${prefix}TOKEN_URL`]) errors.push(`${prefix}TOKEN_URL is required when ${prefix}CLIENT_ID is set`);
  });

  // Numeric sanity checks (common ones used in bff-auth)
  const numericVars = ['PORT', 'REFRESH_TOKEN_TTL_MS', 'BCRYPT_ROUNDS'];
  numericVars.forEach(k => {
    if (env[k] && Number.isNaN(Number.parseInt(env[k], 10))) {
      errors.push(`${k} must be a valid integer`);
    }
  });

  return { errors, warnings };
}

// The original validateEnv used by tests validates a smaller set of vars
function validateEnv() {
  const { logger } = require('../commons/lib/logger');
  const env = process.env;
  const errors = [];
  const warnings = [];

  // Legacy required variables (kept for compatibility with existing tests)
  const required = [
    { key: 'PORT', description: 'Server port' },
    { key: 'ASTRO_API_URL', description: 'Astrology provider base URL' },
    { key: 'ASTRO_API_KEY', description: 'Astrology provider API key' }
  ];

  for (const { key, description } of required) {
    const value = env[key];
    if (!value || String(value).trim() === '') {
      errors.push(`${key} (${description}) is required`);
    }
  }

  // Numeric checks used in original implementation
  const numericVars = [
    'PORT', 'RATE_LIMIT_WINDOW_MS', 'RATE_LIMIT_MAX_REQUESTS',
    'STRICT_RATE_LIMIT_WINDOW_MS', 'STRICT_RATE_LIMIT_MAX_REQUESTS',
    'GEOCODE_CACHE_TTL', 'GEOCODE_RETRIES', 'GEOCODE_BASE_DELAY_MS',
    'SHUTDOWN_TIMEOUT_MS'
  ];
  numericVars.forEach(k => {
    const v = env[k];
    if (v && Number.isNaN(Number.parseInt(v, 10))) {
      errors.push(`Environment variable ${k} must be a valid number, got: ${v}`);
    }
  });

  // URL format checks
  const urlVars = ['ASTRO_API_URL', 'GEOCODE_MAPS_BASE'];
  urlVars.forEach(k => {
    const v = env[k];
    if (v && !(v.startsWith('http://') || v.startsWith('https://'))) {
      errors.push(`Environment variable ${k} must be a valid URL (http:// or https://), got: ${v}`);
    }
  });

  if (warnings.length > 0) {
    logger.warn({ msg: 'Environment validation warnings', warnings, note: 'Application will continue but some features may not work correctly' });
  }

  if (errors.length > 0) {
    logger.fatal({ msg: 'Environment validation failed - missing or invalid required configuration', errors });
    console.error('\n❌ Environment Validation Failed:\n');
    errors.forEach(err => console.error(`  - ${err}`));
    console.error('\nPlease check your .env file and ensure all required variables are set.\n');
    throw new Error('process.exit:1');
  }

  logger.info({ msg: 'Environment validation passed', env: env.NODE_ENV || 'development', port: env.PORT });
  return true;
}

function validateOrExit(opts) {
  const { errors, warnings } = validateChecks(opts);
  if (warnings && warnings.length > 0) {
    console.warn('Environment validation warnings:');
    warnings.forEach(w => console.warn(' -', w));
  }
  if (errors && errors.length > 0) {
    console.error('Environment validation failed for bff-auth:');
    errors.forEach(e => console.error(' -', e));
    // ensure logs flush
    setTimeout(() => process.exit(1), 20);
  }
  return { ok: errors.length === 0, errors, warnings };
}

module.exports = { validateEnv, validateChecks, validateOrExit };

if (require.main === module) {
  validateOrExit();
}
