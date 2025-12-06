// Development environment configuration
// Optimized for local development with verbose logging and relaxed limits

const defaultConfig = require('./default');

module.exports = {
  ...defaultConfig,
  
  server: {
    ...defaultConfig.server,
    port: 3000
  },
  
  cors: {
    origin: ['http://localhost:5173', 'http://localhost:3000', 'http://127.0.0.1:5173'],
    credentials: true
  },
  
  rateLimit: {
    general: {
      windowMs: 60000,
      maxRequests: 1000 // Very high for local dev
    },
    strict: {
      windowMs: 60000,
      maxRequests: 200 // Relaxed for development
    }
  },
  
  logging: {
    level: 'debug', // Verbose logging
    prettyPrint: true, // Human-readable logs
    slowRequestMs: 1000,
    verySlowRequestMs: 3000
  },
  
  cache: {
    geocode: {
      ttl: 3600 // 1 hour for faster iteration
    }
  },
  
  features: {
    webhookRoute: true, // Enable webhook receiver in dev
    probeEndpoint: true // Enable astrology probe endpoint
  }
};
