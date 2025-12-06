const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

// Validate environment variables at startup
const { validateEnv } = require('./lib/validateEnv');
validateEnv();

const config = require('../config');
const { attachResponseHelpers, ErrorCodes } = require('./lib/responses');
const geocodeRouter = require('./routes/geocode');
const astrologyRouter = require('./routes/astrology');
const telemetryRouter = require('./routes/telemetry');
const { logger, reqIdFromReq } = require('./lib/logger');

const app = express();
const PORT = config.server.port;

app.use(helmet());

// CORS configuration from environment-specific config
app.use(cors(config.cors));

// Compression middleware (gzip/brotli)
app.use(compression({
  threshold: config.compression.threshold,
  level: config.compression.level
}));

app.use(bodyParser.json({ limit: config.server.bodyLimit }));
app.use(bodyParser.urlencoded({ extended: false }));

// Rate limiting configuration
const apiLimiter = rateLimit({
  windowMs: config.rateLimit.general.windowMs,
  max: config.rateLimit.general.maxRequests,
  standardHeaders: true,
  legacyHeaders: false,
  message: { status: 'error', reason: 'rate_limit_exceeded', message: 'Too many requests, please try again later.' }
});

// Stricter rate limiting for expensive endpoints
const strictLimiter = rateLimit({
  windowMs: config.rateLimit.strict.windowMs,
  max: config.rateLimit.strict.maxRequests,
  standardHeaders: true,
  legacyHeaders: false,
  message: { status: 'error', reason: 'rate_limit_exceeded', message: 'Too many requests to this endpoint, please try again later.' }
});

// Request ID middleware: honor incoming `x-request-id` or generate one,
// attach to `req._niyati_reqId`, echo it back in the response headers,
// and log a single incoming_request line for easy correlation.
app.use((req, res, next) => {
  try {
    const incoming = req.headers['x-request-id'] || req.headers['x-correlation-id'] || reqIdFromReq(req);
    const reqId = incoming || `niyati-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,8)}`;
    req._niyati_reqId = reqId;
    // Echo back for clients / downstream correlators
    res.setHeader('x-request-id', reqId);
    logger.info({ msg: 'incoming_request', method: req.method, path: req.originalUrl || req.url, reqId });
  } catch (e) {
    // best-effort logging; don't block the request
  }
  return next();
});

// Attach response helper methods (sendError, sendSuccess)
app.use(attachResponseHelpers);

// Response time logging middleware
app.use((req, res, next) => {
  const startTime = Date.now();
  
  // Capture when response finishes
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    const logData = {
      msg: 'request_completed',
      method: req.method,
      path: req.originalUrl || req.url,
      statusCode: res.statusCode,
      durationMs: duration,
      reqId: req._niyati_reqId
    };
    
    // Log at different levels based on response time
    if (duration > config.logging.verySlowRequestMs) {
      logger.error({ ...logData, severity: 'very_slow_request' });
    } else if (duration > config.logging.slowRequestMs) {
      logger.warn({ ...logData, severity: 'slow_request' });
    } else {
      logger.info(logData);
    }
  });
  
  next();
});

// API version prefix
const API_VERSION = config.server.apiVersion;
const apiRouter = express.Router();

// Mount versioned API routes with rate limiting
apiRouter.use('/geocode', strictLimiter, geocodeRouter);
apiRouter.use('/astrology', strictLimiter, astrologyRouter);
apiRouter.use('/telemetry', apiLimiter, telemetryRouter);

// Dev-only webhook receiver: enable based on feature flag
if (config.features.webhookRoute) {
  try {
    const webhookRouter = require('./routes/webhook');
    apiRouter.use('/webhook', webhookRouter);
  } catch (e) {
    // If the route file is missing or errors, don't crash the server
    console.warn('Webhook route not loaded:', e && e.message);
  }
}

// Mount API router under versioned path
app.use(`/api/${API_VERSION}`, apiRouter);

// For backward compatibility, also mount on /api (will be deprecated)
app.use('/api', (req, res, next) => {
  // Add deprecation warning header
  res.setHeader('X-API-Deprecated', 'true');
  res.setHeader('X-API-Version', API_VERSION);
  logger.warn({ msg: 'deprecated_api_path', path: req.path, reqId: req._niyati_reqId });
  next();
}, apiRouter);

app.get('/', (req, res) => res.json({ 
  status: 'ok', 
  name: 'Niyati BFF',
  version: API_VERSION,
  endpoints: {
    current: `/api/${API_VERSION}`,
    deprecated: '/api'
  }
}));

// 404 handler for undefined routes
app.use((req, res) => {
  logger.warn({ msg: 'route_not_found', method: req.method, path: req.originalUrl || req.url, reqId: req._niyati_reqId });
  res.sendError(ErrorCodes.NOT_FOUND, 'The requested endpoint does not exist.');
});

// Global error handler middleware - must be last
app.use((err, req, res, next) => {
  const reqId = req._niyati_reqId || 'unknown';
  
  // Log the error with full details
  logger.error({
    msg: 'unhandled_error',
    error: err.message,
    stack: err.stack,
    reqId,
    method: req.method,
    path: req.originalUrl || req.url
  });
  
  // Don't leak error details in production
  const isProduction = config.isProduction;
  const message = isProduction ? 'An internal error occurred. Please try again later.' : err.message;
  const details = !isProduction && err.stack ? { stack: err.stack.split('\n').map(line => line.trim()) } : undefined;
  
  // Use error status code if available, otherwise 500
  const statusCode = err.status || err.statusCode || 500;
  
  res.sendError(ErrorCodes.INTERNAL_SERVER_ERROR, message, { details, statusCode });
});

const server = app.listen(PORT, () => {
  logger.info({ msg: `Niyati BFF listening on http://localhost:${PORT}`, port: PORT });
});

// Graceful shutdown handler
const gracefulShutdown = (signal) => {
  logger.info({ msg: `${signal} received, starting graceful shutdown` });
  
  server.close(() => {
    logger.info({ msg: 'HTTP server closed' });
    
    // Give ongoing requests a chance to complete
    setTimeout(() => {
      logger.info({ msg: 'Graceful shutdown complete, exiting' });
      process.exit(0);
    }, config.server.shutdownGracePeriodMs);
  });
  
  // Force shutdown after timeout
  setTimeout(() => {
    logger.error({ msg: 'Forced shutdown after timeout' });
    process.exit(1);
  }, config.server.shutdownTimeoutMs);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
