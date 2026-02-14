// Re-export from @niyati/auth-core for backward compatibility.
// The niyati-specific default config is applied here so existing consumers
// that rely on pre-created limiters continue to work.

const { createRateLimiter } = require('@niyati/auth-core/lib/rateLimiter');

const defaultConfig = require('../config').rateLimit || {};

// Backward compatible default instance
const DEFAULT_LIMITERS = createRateLimiter(defaultConfig);

module.exports = Object.assign({ createRateLimiter }, DEFAULT_LIMITERS);
