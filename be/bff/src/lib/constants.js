// Application-wide constants
// Extract magic numbers to improve maintainability and clarity

// Server configuration
const SERVER = {
  // Default port if not specified in environment
  DEFAULT_PORT: 3000,
  
  // Request body size limits
  JSON_BODY_LIMIT: '500kb',
  
  // Graceful shutdown timing
  SHUTDOWN_GRACE_PERIOD_MS: 1000, // Time to allow ongoing requests to complete
  DEFAULT_SHUTDOWN_TIMEOUT_MS: 10000 // Force shutdown after this timeout
};

// Rate limiting configuration
const RATE_LIMIT = {
  // General API endpoints
  DEFAULT_WINDOW_MS: 60000, // 1 minute
  DEFAULT_MAX_REQUESTS: 100, // requests per window
  
  // Strict limits for expensive endpoints (geocode, astrology)
  STRICT_WINDOW_MS: 60000,
  STRICT_MAX_REQUESTS: 20
};

// Caching configuration (in seconds)
const CACHE = {
  // Geocoding cache TTL
  GEOCODE_DEFAULT_TTL: 86400, // 24 hours
  
  // Future: can add astrology cache, session cache, etc.
};

// Retry and backoff configuration
const RETRY = {
  // Geocode service retry configuration
  GEOCODE_DEFAULT_RETRIES: 3,
  GEOCODE_DEFAULT_BASE_DELAY_MS: 400,
  GEOCODE_DEFAULT_MAX_DELAY_MS: 5000,
  
  // HTTP status codes that warrant retry (transient errors)
  TRANSIENT_ERROR_CODES: [429, 502, 503, 504]
};

// Response time logging thresholds (in milliseconds)
const TIMING = {
  // Log warning if response takes longer than this
  SLOW_REQUEST_THRESHOLD_MS: 1000,
  
  // Log error if response takes longer than this
  VERY_SLOW_REQUEST_THRESHOLD_MS: 3000
};

// Compression configuration
const COMPRESSION = {
  // Minimum response size to compress (bytes)
  THRESHOLD: 1024, // 1KB
  
  // Compression level (0-9, where 9 is best compression but slowest)
  LEVEL: 6 // Balanced default
};

module.exports = {
  SERVER,
  RATE_LIMIT,
  CACHE,
  RETRY,
  TIMING,
  COMPRESSION
};
