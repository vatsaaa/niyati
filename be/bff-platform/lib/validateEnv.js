/**
 * Environment validation for bff-platform
 * Exports: validateEnv(), validateChecks(), validateOrExit()
 */

function validateChecks(opts = {}) {
  const env = process.env;
  const errors = [];
  const warnings = [];

  const required = [
    { key: 'PORT', desc: 'Server port' },
    { key: 'ASTRO_API_URL', desc: 'Astrology provider base URL' },
    { key: 'ASTRO_API_KEY', desc: 'Astrology provider API key' }
  ];

  required.forEach(({ key, desc }) => {
    if (!env[key] || String(env[key]).trim() === '') errors.push(`${key} (${desc}) is required`);
  });

  // Numeric sanity checks
  const numericVars = ['PORT', 'GEOCODE_RETRIES', 'GEOCODE_BASE_DELAY_MS'];
  numericVars.forEach(k => {
    if (env[k] && Number.isNaN(Number.parseInt(env[k], 10))) {
      errors.push(`${k} must be a valid integer`);
    }
  });

  // URL checks
  const urlVars = ['ASTRO_API_URL', 'GEOCODE_MAPS_BASE'];
  urlVars.forEach(k => {
    const v = env[k];
    if (v && !(v.startsWith('http://') || v.startsWith('https://'))) {
      errors.push(`${k} must be a valid URL (http:// or https://)`);
    }
  });

  return { errors, warnings };
}

function validateEnv() {
  // Use commons logger when available to keep messages consistent
  let logger = console;
  try {
    ({ logger } = require('../commons/lib/logger'));
  } catch (e) {
    // fall back to console
  }

  const { errors, warnings } = validateChecks();
  if (warnings && warnings.length > 0) {
    try { logger.warn({ msg: 'Environment validation warnings', warnings }); } catch (e) { console.warn(warnings); }
  }

  if (errors && errors.length > 0) {
    try { logger.fatal({ msg: 'Environment validation failed', errors }); } catch (e) { console.error(errors); }
    console.error('\n❌ Environment Validation Failed (bff-platform):\n');
    errors.forEach(err => console.error('  -', err));
    throw new Error('process.exit:1');
  }

  try { logger.info({ msg: 'Environment validation passed', env: process.env.NODE_ENV || 'development' }); } catch (e) { console.log('env ok'); }
  return true;
}

function validateOrExit(opts) {
  const { errors, warnings } = validateChecks(opts);
  if (warnings && warnings.length > 0) {
    console.warn('Environment validation warnings:');
    warnings.forEach(w => console.warn(' -', w));
  }
  if (errors && errors.length > 0) {
    console.error('Environment validation failed for bff-platform:');
    errors.forEach(e => console.error(' -', e));
    setTimeout(() => process.exit(1), 20);
  }
  return { ok: errors.length === 0, errors, warnings };
}

module.exports = { validateEnv, validateChecks, validateOrExit };

if (require.main === module) {
  validateOrExit();
}
