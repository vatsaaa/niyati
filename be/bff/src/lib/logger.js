const pino = require('pino');
const crypto = require('crypto');

const level = (process.env.LOG_LEVEL || 'info').toLowerCase();
// Emit the numeric process id so logs include a real `pid` (helpful for correlation)
const logger = pino({ level, redact: { paths: [], censor: '***REDACTED***' }, base: { pid: process.pid } });

// Simple sanitizer for log payloads to avoid leaking PII
function sanitize(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  try {
    const clone = JSON.parse(JSON.stringify(obj));
    const SENSITIVE_RE = /(?:phone|phonenumber|email|ssn|passport|aadhar|nationalid|api[_-]?key|apikey|token|access[_-]?token|authorization|auth|password|card|cvv|creditcard|bank[_-]?account|account[_-]?number|routing[_-]?number|id(_)?number|\baddress\b|street|zip|zipcode)/i;
    const VALUE_SENSITIVE_RE = /^(?:\d{12,19}|[A-Za-z0-9-_]{30,}|[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+)$/;
    const BASE64_RE = /^[A-Za-z0-9+/=]{40,}$/;
    const redact = (o, depth = 0) => {
      if (!o || typeof o !== 'object' || depth > 12) return;
      if (Array.isArray(o)) {
        for (let i = 0; i < o.length; i++) {
          const v = o[i];
          if (typeof v === 'object') redact(v, depth + 1);
          else if (typeof v === 'string') {
            if (v.includes('@') || /^\d{8,}$/.test(v) || VALUE_SENSITIVE_RE.test(v) || BASE64_RE.test(v)) o[i] = '[REDACTED]';
          }
        }
        return;
      }
      for (const k of Object.keys(o)) {
        try {
          const lk = k.toString().toLowerCase();
          const v = o[k];
          if (SENSITIVE_RE.test(lk)) { o[k] = '[REDACTED]'; continue; }
          if (lk === 'headers' && v && typeof v === 'object') {
            if (v.authorization) v.authorization = '[REDACTED]';
            if (v['x-api-key']) v['x-api-key'] = '[REDACTED]';
            if (v.api_key) v.api_key = '[REDACTED]';
            redact(v, depth + 1);
            continue;
          }
          if (typeof v === 'string') {
            if (v.includes('@')) { o[k] = '[REDACTED]'; continue; }
            if (/^\d{8,}$/.test(v)) { o[k] = '[REDACTED]'; continue; }
            if (VALUE_SENSITIVE_RE.test(v) || BASE64_RE.test(v)) { o[k] = '[REDACTED]'; continue; }
            if (lk === 'authorization' || lk === 'auth' || lk === 'token' || lk.includes('api_key') || lk.includes('apikey')) { o[k] = '[REDACTED]'; continue; }
          } else if (typeof v === 'object') redact(v, depth + 1);
        } catch (e) { }
      }
    };
    redact(clone);
    return clone;
  } catch (e) {
    return obj;
  }
}

function reqIdFromReq(req) {
  if (!req) return undefined;
  return req.headers && (req.headers['x-request-id'] || req.headers['x-correlation-id']);
}

module.exports = {
  logger,
  sanitize,
  reqIdFromReq
};
