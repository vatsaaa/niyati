const express = require('express');
const { logger, sanitize, ErrorCodes } = require('@niyati/commons');

const router = express.Router();

// Internal endpoints used by other services. Require X-Service-Token when SERVICE_TOKEN is configured.

function requireServiceToken(req, res, next) {
  const svcToken = process.env.SERVICE_TOKEN || '';
  const incoming = req.headers['x-service-token'] || '';
  if (svcToken && svcToken.length > 0 && incoming !== svcToken) {
    logger && logger.warn && logger.warn({ msg: 'internal.auth.invalid_service_token' });
    return res.sendError(ErrorCodes.UNAUTHORIZED, 'unauthorized');
  }
  return next();
}

// GET /internal/users/lookup?phoneNumber=+
router.get('/users/lookup', requireServiceToken, async (req, res) => {
  try {
    const phone = (req.query.phoneNumber || '').trim();
    if (!phone) return res.sendError(ErrorCodes.MISSING_REQUIRED_FIELD, 'missing_phone_number');

    const db = req.app.get('db');
    if (!db) return res.sendError(ErrorCodes.INTERNAL_SERVER_ERROR, 'Database not configured');

    const sql = `SELECT id, phone_number, name, date_of_birth, time_of_birth, place_of_birth, lat, lon, timezone, consent_given, created_at, updated_at FROM users WHERE regexp_replace(phone_number, '[^0-9]', '', 'g') = regexp_replace($1, '[^0-9]', '', 'g') LIMIT 1`;
    const result = await db.query(sql, [phone]);
    if (!result || !result.rows || result.rows.length === 0) {
      return res.sendSuccess({ user: null });
    }
    const user = result.rows[0];
    return res.sendSuccess({ user });
  } catch (err) {
    logger && logger.error && logger.error(sanitize({ msg: 'internal.users.lookup.error', err: err && err.message }));
    return res.sendError(ErrorCodes.INTERNAL_SERVER_ERROR, 'lookup_failed');
  }
});

// GET /internal/users/:id
router.get('/users/:id', requireServiceToken, async (req, res) => {
  try {
    const id = req.params.id;
    if (!id) return res.sendError(ErrorCodes.MISSING_REQUIRED_FIELD, 'missing_id');

    const db = req.app.get('db');
    if (!db) return res.sendError(ErrorCodes.INTERNAL_SERVER_ERROR, 'Database not configured');

    const sql = `SELECT id, phone_number, name, date_of_birth, time_of_birth, place_of_birth, lat, lon, timezone, consent_given, created_at, updated_at FROM users WHERE id = $1 LIMIT 1`;
    const result = await db.query(sql, [id]);
    if (!result || !result.rows || result.rows.length === 0) {
      return res.sendSuccess({ user: null });
    }
    return res.sendSuccess({ user: result.rows[0] });
  } catch (err) {
    logger && logger.error && logger.error(sanitize({ msg: 'internal.users.byId.error', err: err && err.message }));
    return res.sendError(ErrorCodes.INTERNAL_SERVER_ERROR, 'lookup_failed');
  }
});

module.exports = router;
