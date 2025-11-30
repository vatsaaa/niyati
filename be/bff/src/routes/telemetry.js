const express = require('express');
const router = express.Router();
const { logger, sanitize, reqIdFromReq } = require('../lib/logger');

// Telemetry rate-limiter (token bucket) with sampling fallback.
// Environment variables:
// - TELEMETRY_MAX_EVENTS: maximum events allowed per window (default 200)
// - TELEMETRY_WINDOW_MS: window size in milliseconds for refill (default 60000)
// - TELEMETRY_SAMPLE_RATE: fraction [0..1] of events to sample when over limit (default 0.05)

const MAX_EVENTS = parseInt(process.env.TELEMETRY_MAX_EVENTS || '200', 10);
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

// POST /api/telemetry/log
// Body: { tag?: string, meta?: object, ts?: number }
router.post('/log', (req, res) => {
  refillTokens();

  const reqId = req.headers['x-request-id'] || reqIdFromReq(req) || 'no-reqid';
  const { tag, meta, ts } = req.body || {};

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
    return res.status(429).json({ status: 'rate_limited' });
  }

  try {
    // Mark sampled events in logs so they can be filtered/treated differently
    const logPayload = sanitize({ tag: tag || 'client.telemetry', reqId, meta, ts, sampled });
    // Use debug for normal telemetry; use info for sampled to ensure retention if needed
    if (sampled) logger.info(logPayload); else logger.debug(logPayload);
  } catch (e) {
    // best-effort
  }

  return res.json({ status: 'ok', sampled });
});

module.exports = router;
