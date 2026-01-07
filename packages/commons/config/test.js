// Test environment configuration
module.exports = {
    server: {
        port: 4000
    },
    logging: {
        level: 'error', // Reduce noise during tests
        prettyPrint: true
    },
    rateLimit: {
        general: {
            windowMs: 60000,
            maxRequests: 1000 // Higher limit for tests
        },
        strict: {
            windowMs: 60000,
            maxRequests: 1000
        }
    },
    retry: {
        geocode: {
            retries: 0, // Fail fast in tests
            baseDelayMs: 0
        }
    }
};
