// Validate critical environment variables at startup
// Fail fast if required configuration is missing

const { logger } = require('./logger');

function validateEnv() {
  const errors = [];
  const warnings = [];

  // Required variables
  const required = [
    { key: 'PORT', description: 'Server port' },
    { key: 'ASTRO_API_URL', description: 'Astrology provider base URL' },
    { key: 'ASTRO_API_KEY', description: 'Astrology provider API key' }
  ];

  // Optional but recommended variables
  const recommended = [
    { key: 'GEOCODE_MAPS_KEY', description: 'Geocoding API key (maps.co)' },
    { key: 'NODE_ENV', description: 'Environment (development/production)' },
    { key: 'LOG_LEVEL', description: 'Logging level' }
  ];

  // Check required variables
  for (const { key, description } of required) {
    const value = process.env[key];
    if (!value || value.trim() === '') {
      errors.push(`Missing required environment variable: ${key} (${description})`);
    }
  }

  // Check recommended variables
  for (const { key, description } of recommended) {
    const value = process.env[key];
    if (!value || value.trim() === '') {
      warnings.push(`Missing recommended environment variable: ${key} (${description})`);
    }
  }

  // Validate numeric values
  const numericVars = [
    'PORT', 'RATE_LIMIT_WINDOW_MS', 'RATE_LIMIT_MAX_REQUESTS',
    'STRICT_RATE_LIMIT_WINDOW_MS', 'STRICT_RATE_LIMIT_MAX_REQUESTS',
    'GEOCODE_CACHE_TTL', 'GEOCODE_RETRIES', 'GEOCODE_BASE_DELAY_MS',
    'SHUTDOWN_TIMEOUT_MS'
  ];

  for (const key of numericVars) {
    const value = process.env[key];
    if (value && isNaN(parseInt(value, 10))) {
      errors.push(`Environment variable ${key} must be a valid number, got: ${value}`);
    }
  }

  // Validate NODE_ENV if present
  if (process.env.NODE_ENV) {
    const validEnvs = ['development', 'production', 'test', 'staging'];
    if (!validEnvs.includes(process.env.NODE_ENV)) {
      warnings.push(`NODE_ENV should be one of: ${validEnvs.join(', ')}. Got: ${process.env.NODE_ENV}`);
    }
  }

  // Validate URL formats
  const urlVars = ['ASTRO_API_URL', 'GEOCODE_MAPS_BASE'];
  for (const key of urlVars) {
    const value = process.env[key];
    if (value && !value.startsWith('http://') && !value.startsWith('https://')) {
      errors.push(`Environment variable ${key} must be a valid URL (http:// or https://), got: ${value}`);
    }
  }

  // Report warnings
  if (warnings.length > 0) {
    logger.warn({
      msg: 'Environment validation warnings',
      warnings,
      note: 'Application will continue but some features may not work correctly'
    });
  }

  // Report errors and fail fast
  if (errors.length > 0) {
    logger.fatal({
      msg: 'Environment validation failed - missing or invalid required configuration',
      errors
    });
    console.error('\n❌ Environment Validation Failed:\n');
    errors.forEach(err => console.error(`  - ${err}`));
    console.error('\nPlease check your .env file and ensure all required variables are set.\n');
    process.exit(1);
  }

  logger.info({
    msg: 'Environment validation passed',
    env: process.env.NODE_ENV || 'development',
    port: process.env.PORT
  });
}

module.exports = { validateEnv };
