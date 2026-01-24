/**
 * Shared environment validation for all services
 * Supports bff-platform, bff-auth, and worker
 * Exports: validateEnv(), validateChecks(), validateOrExit()
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
  const env = process.env;
  const errors = [];
  const warnings = [];
  const service = opts.service || 'unknown';

  // Common required variables (used by all services)
  const commonRequired = [
    { key: 'PORT', desc: 'Server port' }
  ];

  // Service-specific required variables
  const serviceRequired = {
    'bff-platform': [
      { key: 'ASTRO_API_URL', desc: 'Astrology provider base URL' },
      { key: 'ASTRO_API_KEY', desc: 'Astrology provider API key' }
    ],
    'bff-auth': [
      { key: 'ASTRO_API_URL', desc: 'Astrology provider base URL' },
      { key: 'ASTRO_API_KEY', desc: 'Astrology provider API key' },
      { key: 'ACCESS_TOKEN_SECRET', desc: 'JWT access token secret', allowAlternative: ['ACCESS_TOKEN_SECRET_FILE'] }
    ],
    'worker': [
      { key: 'REDIS_URL', desc: 'Redis connection URL (or REDIS_HOST)', allowAlternative: ['REDIS_HOST'] },
      { key: 'SMTP_USER', desc: 'SMTP username (or SMTP_USER_FILE)', allowAlternative: ['SMTP_USER_FILE'] },
      { key: 'SMTP_PASSWORD', desc: 'SMTP password (or SMTP_PASSWORD_FILE)', allowAlternative: ['SMTP_PASSWORD_FILE'] }
    ]
  };

  const required = [...commonRequired, ...(serviceRequired[service] || [])];

  required.forEach(({ key, desc, allowAlternative }) => {
    const hasValue = env[key] && String(env[key]).trim() !== '';
    const hasAlternative = allowAlternative && allowAlternative.some(alt => env[alt] && String(env[alt]).trim() !== '');
    
    if (!hasValue && !hasAlternative) {
      errors.push(`${key} (${desc}) is required`);
    }
  });

  // bff-auth: Database validation (require unless explicitly allowed)
  if (service === 'bff-auth') {
    const requireDb = opts.requireDb !== undefined ? opts.requireDb : (env.NODE_ENV !== 'test' && env.BFF_AUTH_ALLOW_NO_DB !== 'true');
    if (requireDb) {
      if (!env.DATABASE_URL && !(env.PGHOST && env.PGUSER && env.PGDATABASE)) {
        errors.push('Database configuration missing: set DATABASE_URL or PGHOST/PGUSER/PGDATABASE');
      }
    } else {
      if (!env.DATABASE_URL) warnings.push('DATABASE_URL not set; DB features are disabled in this environment');
    }

    // OAuth provider sanity checks
    const providers = findOAuthProviders();
    providers.forEach(p => {
      const prefix = `OAUTH_${p}_`;
      if (!env[`${prefix}CLIENT_SECRET`]) errors.push(`${prefix}CLIENT_SECRET is required when ${prefix}CLIENT_ID is set`);
      if (!env[`${prefix}AUTHORIZE_URL`]) errors.push(`${prefix}AUTHORIZE_URL is required when ${prefix}CLIENT_ID is set`);
      if (!env[`${prefix}TOKEN_URL`]) errors.push(`${prefix}TOKEN_URL is required when ${prefix}CLIENT_ID is set`);
    });
  }

  // Numeric sanity checks (common across services)
  const numericVars = [
    'PORT', 
    'RATE_LIMIT_WINDOW_MS', 
    'RATE_LIMIT_MAX_REQUESTS',
    'STRICT_RATE_LIMIT_WINDOW_MS', 
    'STRICT_RATE_LIMIT_MAX_REQUESTS',
    'GEOCODE_CACHE_TTL', 
    'GEOCODE_RETRIES', 
    'GEOCODE_BASE_DELAY_MS',
    'SHUTDOWN_TIMEOUT_MS',
    'REFRESH_TOKEN_TTL_MS',
    'BCRYPT_ROUNDS'
  ];
  
  numericVars.forEach(k => {
    if (env[k] && Number.isNaN(Number.parseInt(env[k], 10))) {
      errors.push(`${k} must be a valid integer`);
    }
  });

  // URL checks (common across services)
  const urlVars = ['ASTRO_API_URL', 'GEOCODE_MAPS_BASE'];
  urlVars.forEach(k => {
    const v = env[k];
    if (v && !(v.startsWith('http://') || v.startsWith('https://'))) {
      errors.push(`${k} must be a valid URL (http:// or https://)`);
    }
  });

  return { errors, warnings };
}

function validateEnv(opts = {}) {
  // Use commons logger when available to keep messages consistent
  let logger = console;
  try {
    ({ logger } = require('./logger'));
  } catch (e) {
    // fall back to console
  }

  const { errors, warnings } = validateChecks(opts);
  
  if (warnings && warnings.length > 0) {
    try { 
      logger.warn({ 
        msg: 'Environment validation warnings', 
        warnings,
        service: opts.service || 'unknown',
        note: 'Application will continue but some features may not work correctly' 
      }); 
    } catch (e) { 
      console.warn(warnings); 
    }
  }

  if (errors && errors.length > 0) {
    try { 
      logger.fatal({ 
        msg: 'Environment validation failed', 
        errors,
        service: opts.service || 'unknown'
      }); 
    } catch (e) {
      if (process.env.NODE_ENV !== 'test') console.error(errors);
    }

    // During `test` runs we still want the validation to throw (so tests can assert
    // validation behavior) but avoid noisy console output. For non-test runs, keep
    // the original verbose logging to help operators debug missing configuration.
    if (process.env.NODE_ENV !== 'test') {
      const serviceName = opts.service ? ` (${opts.service})` : '';
      console.error(`\n❌ Environment Validation Failed${serviceName}:\n`);
      errors.forEach(err => console.error('  -', err));
      console.error('\nPlease check your .env file and ensure all required variables are set.\n');
    }

    throw new Error('process.exit:1');
  }

  try { 
    logger.info({ 
      msg: 'Environment validation passed', 
      env: process.env.NODE_ENV || 'development',
      service: opts.service || 'unknown',
      port: process.env.PORT 
    }); 
  } catch (e) { 
    console.log('env ok'); 
  }
  
  return true;
}

function validateOrExit(opts = {}) {
  const { errors, warnings } = validateChecks(opts);
  const serviceName = opts.service ? ` for ${opts.service}` : '';
  
  if (warnings && warnings.length > 0) {
    console.warn(`Environment validation warnings${serviceName}:`);
    warnings.forEach(w => console.warn(' -', w));
  }
  
  if (errors && errors.length > 0) {
    console.error(`Environment validation failed${serviceName}:`);
    errors.forEach(e => console.error(' -', e));
    setTimeout(() => process.exit(1), 20);
  }
  
  return { ok: errors.length === 0, errors, warnings };
}

module.exports = { validateEnv, validateChecks, validateOrExit };

if (require.main === module) {
  validateOrExit();
}
