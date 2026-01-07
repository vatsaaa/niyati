// Staging environment configuration
// Production-like settings for pre-release testing

const defaultConfig = require('./default');

module.exports = {
  ...defaultConfig,
  
  server: {
    ...defaultConfig.server,
    port: 3000
  },
  
  cors: {
    origin: [
      'https://staging.niyati.example.com',
      'https://staging-ui.niyati.example.com'
    ],
    credentials: true
  },
  
  rateLimit: {
    general: {
      windowMs: 60000,
      maxRequests: 150 // Slightly higher than prod for testing
    },
    strict: {
      windowMs: 60000,
      maxRequests: 30
    }
  },
  
  logging: {
    level: 'info',
    prettyPrint: false, // JSON logs for aggregation
    slowRequestMs: 1000,
    verySlowRequestMs: 3000
  },
  
  cache: {
    geocode: {
      ttl: 86400 // 24 hours like production
    }
  },
  
  compression: {
    threshold: 1024,
    level: 6
  },
  
  features: {
    webhookRoute: false, // Disable dev-only routes
    probeEndpoint: false // Disable debug endpoints
  }
};
