// Configuration loader - loads environment-specific config based on NODE_ENV

const path = require('path');

// Determine current environment
const NODE_ENV = process.env.NODE_ENV || 'development';
const validEnvs = ['development', 'staging', 'production', 'test'];

if (!validEnvs.includes(NODE_ENV)) {
  console.warn(`Invalid NODE_ENV: ${NODE_ENV}. Defaulting to 'development'. Valid values: ${validEnvs.join(', ')}`);
}

// Load environment-specific config
let config;
try {
  const envConfigPath = path.join(__dirname, `${NODE_ENV}.js`);
  config = require(envConfigPath);
} catch (err) {
  console.warn(`Could not load config for environment: ${NODE_ENV}. Falling back to default config.`);
  config = require('./default');
}

// Helper function to get nested config values with environment variable override
function getConfigValue(configPath, envVarName, defaultValue) {
  // First check environment variable
  if (process.env[envVarName] !== undefined) {
    const envValue = process.env[envVarName];
    // Try to parse as number if it looks numeric
    if (/^\d+$/.test(envValue)) {
      return parseInt(envValue, 10);
    }
    // Parse boolean strings
    if (envValue === 'true') return true;
    if (envValue === 'false') return false;
    return envValue;
  }
  
  // Then check config object
  const parts = configPath.split('.');
  let value = config;
  for (const part of parts) {
    if (value && typeof value === 'object' && part in value) {
      value = value[part];
    } else {
      return defaultValue;
    }
  }
  return value !== undefined ? value : defaultValue;
}

// Export config with convenient getters
module.exports = {
  // Raw config object
  raw: config,
  
  // Current environment
  env: NODE_ENV,
  isDevelopment: NODE_ENV === 'development',
  isStaging: NODE_ENV === 'staging',
  isProduction: NODE_ENV === 'production',
  isTest: NODE_ENV === 'test',
  
  // Helper to get config values with env override
  get: getConfigValue,
  
  // Convenience accessors for common configs
  server: {
    port: getConfigValue('server.port', 'PORT', 3000),
    apiVersion: getConfigValue('server.apiVersion', 'API_VERSION', 'v1'),
    bodyLimit: getConfigValue('server.bodyLimit', 'BODY_LIMIT', '500kb'),
    shutdownGracePeriodMs: getConfigValue('server.shutdownGracePeriodMs', 'SHUTDOWN_GRACE_PERIOD_MS', 1000),
    shutdownTimeoutMs: getConfigValue('server.shutdownTimeoutMs', 'SHUTDOWN_TIMEOUT_MS', 10000)
  },
  
  cors: config.cors,
  
  rateLimit: {
    general: {
      windowMs: getConfigValue('rateLimit.general.windowMs', 'RATE_LIMIT_WINDOW_MS', 60000),
      maxRequests: getConfigValue('rateLimit.general.maxRequests', 'RATE_LIMIT_MAX_REQUESTS', 100)
    },
    strict: {
      windowMs: getConfigValue('rateLimit.strict.windowMs', 'STRICT_RATE_LIMIT_WINDOW_MS', 60000),
      maxRequests: getConfigValue('rateLimit.strict.maxRequests', 'STRICT_RATE_LIMIT_MAX_REQUESTS', 20)
    }
  },
  
  cache: {
    geocode: {
      ttl: getConfigValue('cache.geocode.ttl', 'GEOCODE_CACHE_TTL', 86400)
    }
  },
  
  retry: {
    geocode: {
      retries: getConfigValue('retry.geocode.retries', 'GEOCODE_RETRIES', 3),
      baseDelayMs: getConfigValue('retry.geocode.baseDelayMs', 'GEOCODE_BASE_DELAY_MS', 400),
      maxDelayMs: getConfigValue('retry.geocode.maxDelayMs', 'GEOCODE_MAX_DELAY_MS', 5000)
    }
  },
  
  logging: {
    level: getConfigValue('logging.level', 'LOG_LEVEL', 'info'),
    prettyPrint: getConfigValue('logging.prettyPrint', 'LOG_PRETTY_PRINT', false),
    slowRequestMs: getConfigValue('logging.slowRequestMs', 'SLOW_REQUEST_MS', 1000),
    verySlowRequestMs: getConfigValue('logging.verySlowRequestMs', 'VERY_SLOW_REQUEST_MS', 3000)
  },
  
  compression: {
    threshold: getConfigValue('compression.threshold', 'COMPRESSION_THRESHOLD', 1024),
    level: getConfigValue('compression.level', 'COMPRESSION_LEVEL', 6)
  },
  
  features: {
    webhookRoute: getConfigValue('features.webhookRoute', 'ENABLE_WEBHOOK_ROUTE', !config.isProduction),
    probeEndpoint: getConfigValue('features.probeEndpoint', 'ENABLE_PROBE_ENDPOINT', !config.isProduction)
  },
  
  geocode: {
    baseUrl: getConfigValue('geocode.baseUrl', 'GEOCODE_MAPS_BASE', 'https://geocode.maps.co'),
    userAgent: getConfigValue('geocode.userAgent', 'GEOCODE_USER_AGENT', 'niyati-bff/1.0'),
    timeout: getConfigValue('geocode.timeout', 'GEOCODE_TIMEOUT', 6000)
  }
};
