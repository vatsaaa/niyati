const express = require('express');
const router = express.Router();
const { logger, sanitize } = require('../lib/logger');
const fs = require('fs');
const path = require('path');
const { ErrorCodes } = require('../lib/responses');

// Dev-only webhook receiver: logs headers/body and persists events to tmp/received_webhooks.jsonl
// This file is newline-delimited JSON (NDJSON) for easy inspection.
const TMP_DIR = path.resolve(process.cwd(), 'tmp');
const OUT_FILE = path.join(TMP_DIR, 'received_webhooks.jsonl');

function ensureTmp() {
  try {
    if (!fs.existsSync(TMP_DIR)) fs.mkdirSync(TMP_DIR, { recursive: true });
  } catch (e) {
    // best-effort; log and continue
    console.warn('Failed to ensure tmp dir for webhooks:', e && e.message);
  }
}

router.post('/', (req, res) => {
  try {
    const reqId = req._niyati_reqId || req.headers['x-request-id'] || null;
    const record = {
      ts: new Date().toISOString(),
      reqId,
      path: req.originalUrl,
      headers: sanitize(req.headers),
      body: sanitize(req.body)
    };

    // Log immediately for quick visibility
    logger.info({ msg: 'webhook_received', reqId, path: req.originalUrl });

    // Persist to tmp file (NDJSON)
    try {
      ensureTmp();
      fs.appendFileSync(OUT_FILE, JSON.stringify(record) + '\n', { encoding: 'utf8' });
    } catch (e) {
      // If persistence fails, log and continue — don't fail the request
      logger.warn({ msg: 'webhook_persist_failed', error: e && e.message });
    }

    return res.json({ status: 'ok', received: { reqId, path: req.originalUrl }, stored: OUT_FILE });
  } catch (e) {
    logger.error({ msg: 'webhook_error', error: e && e.message });
    return res.sendError(ErrorCodes.INTERNAL_SERVER_ERROR, 'Webhook internal error');
  }
});

module.exports = router;
