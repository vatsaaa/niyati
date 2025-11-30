const express = require('express');
const router = express.Router();
const { logger, sanitize, reqIdFromReq } = require('../lib/logger');

// POST /api/telemetry/log
// Body: { tag?: string, meta?: object, ts?: number }
router.post('/log', (req, res) => {
  const reqId = req.headers['x-request-id'] || reqIdFromReq(req) || 'no-reqid';
  const { tag, meta, ts } = req.body || {};

  try {
    logger.debug(sanitize({ tag: tag || 'client.telemetry', reqId, meta, ts }));
  } catch (e) {
    // best-effort
  }

  return res.json({ status: 'ok' });
});

module.exports = router;
