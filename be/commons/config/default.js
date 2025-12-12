// Default configuration - base values used across all environments
// Environment-specific configs will override these values

module.exports = {
  server: {
    port: 3000,
    bodyLimit: '500kb',
    shutdownGracePeriodMs: 1000,
    shutdownTimeoutMs: 10000,
    // API version for future compatibility
    apiVersion: 'v1',
    // Default timeout for external requests (ms)
    defaultRequestTimeout: 10000
  },
  
  cors: {
    origin: '*', // Override in production
    credentials: false
  },
  
  rateLimit: {
    general: {
      windowMs: 60000, // 1 minute
      maxRequests: 100
    },
    strict: {
      windowMs: 60000,
      maxRequests: 20
    }
  },
  
  cache: {
    geocode: {
      ttl: 86400 // 24 hours in seconds
    }
  },
  
  retry: {
    geocode: {
      retries: 3,
      baseDelayMs: 400,
      maxDelayMs: 5000
    }
  },
  
  logging: {
    level: 'info',
    prettyPrint: false,
    // Response time thresholds
    slowRequestMs: 1000,
    verySlowRequestMs: 3000
  },
  
  compression: {
    threshold: 1024, // 1KB
    level: 6 // 0-9
  },
  
  // External service defaults
  geocode: {
    baseUrl: 'https://geocode.maps.co',
    userAgent: 'niyati-bff/1.0 (+https://example.com)',
    timeout: 6000
  },
  
  astrology: {
    // Default base URL - override with ASTRO_API_URL env var
    baseUrl: 'https://json.freeastrologyapi.com',
    timeout: 10000 // 10 seconds for astrology calculations
  },
  
  // bff-pthru specific config
  bffPthru: {
    requestTimeoutMs: 60000 // 60 seconds for n8n webhook calls
  },
  
  // n8n webhook configuration
  n8n: {
    webhookUrl: '', // Must be set via N8N_WEBHOOK_URL env var
    token: ''       // Optional, set via N8N_TOKEN env var
  }
};
