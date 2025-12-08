// Production environment configuration
// Optimized for security, performance, and stability

const defaultConfig = require('./default');

module.exports = {
  ...defaultConfig,
  
  server: {
    ...defaultConfig.server,
    port: process.env.PORT || 8080, // Cloud platforms often use 8080
    shutdownTimeoutMs: 30000 // Longer timeout for production traffic
  },
  
  cors: {
    origin: [
      'https://niyati.example.com',
      'https://www.niyati.example.com'
      // Add your production domains here
    ],
    credentials: true
  },
  
  rateLimit: {
    general: {
      windowMs: 60000,
      maxRequests: 100 // Strict limits to prevent abuse
    },
    strict: {
      windowMs: 60000,
      maxRequests: 20 // Very strict for expensive endpoints
    }
  },
  
  logging: {
    level: 'info', // No debug logs in production
    prettyPrint: false, // JSON for log aggregation
    slowRequestMs: 500, // Lower thresholds for production monitoring
    verySlowRequestMs: 2000
  },
  
  cache: {
    geocode: {
      ttl: 86400 // 24 hours
    }
  },
  
  compression: {
    threshold: 512, // Compress smaller responses in prod
    level: 9 // Maximum compression (slower but better ratio)
  },
  
  features: {
    webhookRoute: false, // Disable dev-only routes
    probeEndpoint: false // Disable debug endpoints
  }
};
