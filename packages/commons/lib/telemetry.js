const express = require('express');
const router = express.Router();

// Telemetry rate-limiter (token bucket) with sampling fallback.
// Environment variables:
// - TELEMETRY_MAX_EVENTS: maximum events allowed per window (default 200)
// - TELEMETRY_WINDOW_MS: window size in milliseconds for refill (default 60000)
// - TELEMETRY_SAMPLE_RATE: fraction [0..1] of events to sample when over limit (default 0.05)

// Use a lower default in test/integration runs so rate-limit behavior is exercised
const MAX_EVENTS = parseInt(process.env.TELEMETRY_MAX_EVENTS || '100', 10);
const WINDOW_MS = parseInt(process.env.TELEMETRY_WINDOW_MS || '60000', 10);
const SAMPLE_RATE = Math.min(1, Math.max(0, parseFloat(process.env.TELEMETRY_SAMPLE_RATE || '0.05')));

// token bucket state (process-local)
let tokens = MAX_EVENTS;
let lastRefill = Date.now();
const refillRatePerMs = MAX_EVENTS / Math.max(1, WINDOW_MS);

function refillTokens() {
  const now = Date.now();
  const elapsed = now - lastRefill;
  if (elapsed <= 0) return;
  const add = elapsed * refillRatePerMs;
  tokens = Math.min(MAX_EVENTS, tokens + add);
  lastRefill = now;
}

/**
 * Create telemetry router with service-specific configuration
 * @param {Object} options - Configuration options
 * @param {string} options.serviceName - Name of the service (e.g., 'niyati-bff', 'bff-auth')
 * @param {string} options.packageJsonPath - Path to package.json for version info
 * @param {string} options.commonsPath - Path to commons module (e.g., '../commons' or '../../commons')
 * @returns {express.Router} Configured telemetry router
 */
function createTelemetryRouter(options = {}) {
  const { serviceName = 'niyati-bff', packageJsonPath = '../package.json' } = options;
  
  // Use parent commons module (telemetry.js is at commons/lib/telemetry.js, so '..' is commons/)
  const { logger, sanitize, reqIdFromReq, ErrorCodes, config } = require('..');
  
  // POST /api/telemetry/log
  // Body: { tag?: string, meta?: object, ts?: number, level: string, message: string }
  router.post('/log', (req, res) => {
    refillTokens();

    const reqId = req.headers['x-request-id'] || reqIdFromReq(req) || 'no-reqid';
    const { tag, meta, ts, level, message } = req.body || {};

    // Validate input: require message field and a valid level
    const validLevels = ['debug', 'info', 'warn', 'error'];
    if (!message) return res.sendError(ErrorCodes.MISSING_REQUIRED_FIELD, 'Missing required field: message');
    if (!level || !validLevels.includes(level)) return res.sendError(ErrorCodes.INVALID_INPUT, 'Invalid log level');

    // decide acceptance
    let accepted = false;
    let sampled = false;

    if (tokens >= 1) {
      tokens -= 1;
      accepted = true;
    } else {
      // tokens exhausted; apply sampling fallback
      if (Math.random() < SAMPLE_RATE) {
        accepted = true;
        sampled = true;
      }
    }

    // Response headers to help callers understand limits
    const resetMs = Math.ceil((1 / refillRatePerMs)); // ms until one token roughly
    res.setHeader('X-RateLimit-Limit', String(MAX_EVENTS));
    res.setHeader('X-RateLimit-Remaining', String(Math.floor(tokens)));
    res.setHeader('X-RateLimit-Window-MS', String(WINDOW_MS));
    res.setHeader('X-Telemetry-Sampled', String(sampled));

    if (!accepted) {
      // Too many events; politely ask client to back off
      res.setHeader('Retry-After', String(Math.ceil(WINDOW_MS / Math.max(1, MAX_EVENTS) / 1000))); // seconds estimate
      logger.warn(sanitize({ msg: 'telemetry.rate_limited', reqId, tag: tag || 'client.telemetry' }));
      return res.sendError(ErrorCodes.RATE_LIMIT_EXCEEDED, 'Rate limit exceeded');
    }

    try {
      // Mark sampled events in logs so they can be filtered/treated differently
      const logPayload = sanitize({ tag: tag || 'client.telemetry', reqId, meta, ts, sampled, level, message });
      // Use debug for normal telemetry; use info for sampled to ensure retention if needed
      if (sampled) logger.info(logPayload); else logger.debug(logPayload);
    } catch (e) {
      // best-effort
    }

    // Return a clear acknowledgement expected by integration tests
    return res.sendSuccess({ logged: true, sampled });
  });

  // GET /api/telemetry/health
  // Simple health check endpoint for load balancers and monitoring
  router.get('/health', (req, res) => {
    res.sendSuccess({
      timestamp: new Date().toISOString(),
      uptime: process.uptime()
    });
  });

  // GET /api/telemetry/info
  // System information endpoint
  router.get('/info', (req, res) => {
    res.sendSuccess({
      service: serviceName,
      version: require(packageJsonPath).version,
      apiVersion: config.server.apiVersion,
      environment: config.env,
      node: process.version,
      uptime: process.uptime(),
      memory: {
        rss: process.memoryUsage().rss,
        heapTotal: process.memoryUsage().heapTotal,
        heapUsed: process.memoryUsage().heapUsed,
        external: process.memoryUsage().external
      }
    });
  });

  return router;
}

// Export both the factory function and a default router instance
module.exports = createTelemetryRouter;
module.exports.createTelemetryRouter = createTelemetryRouter;
