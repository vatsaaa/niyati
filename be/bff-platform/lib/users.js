const express = require('express');
const router = express.Router();
const axios = require('axios');
const { logger, sanitize, ErrorCodes, config } = require('../commons');

// POST /users/sync
// Body: profile object (phoneNumber, dateOfBirth, timeOfBirth, placeOfBirth, lat, lon, timezone, consentGiven)
// Requires X-Service-Token header if SERVICE_TOKEN is configured
router.post('/sync', async (req, res) => {
  try {
    const svcToken = process.env.SERVICE_TOKEN || '';
    const incoming = req.headers['x-service-token'] || '';
    if (svcToken && svcToken.length > 0 && incoming !== svcToken) {
      logger.warn({ msg: 'users.sync/lookup: missing/invalid service token' });
      return res.sendError(ErrorCodes.UNAUTHORIZED, 'unauthorized');
    }

    const profile = req.body || {};
    if (!profile.phoneNumber || !profile.consentGiven) {
      return res.sendError(ErrorCodes.MISSING_REQUIRED_FIELD, 'phone_or_consent_missing');
    }

    const db = req.app.get('db');
    if (!db) return res.sendError(ErrorCodes.INTERNAL_SERVER_ERROR, 'Database not configured');

    const upsertSql = `
      INSERT INTO users (
        phone_number, date_of_birth, time_of_birth, place_of_birth,
        lat, lon, timezone, consent_given, consent_date,
        created_at, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now(), now(), now())
      ON CONFLICT (phone_number) DO UPDATE SET
        date_of_birth = EXCLUDED.date_of_birth,
        time_of_birth = EXCLUDED.time_of_birth,
        place_of_birth = EXCLUDED.place_of_birth,
        lat = EXCLUDED.lat,
        lon = EXCLUDED.lon,
        timezone = EXCLUDED.timezone,
        consent_given = EXCLUDED.consent_given,
        updated_at = now()
      RETURNING id, phone_number, created_at, updated_at
    `;

    const params = [
      profile.phoneNumber,
      profile.dateOfBirth || null,
      profile.timeOfBirth || null,
      profile.placeOfBirth || null,
      profile.lat ? parseFloat(profile.lat) : null,
      profile.lon ? parseFloat(profile.lon) : null,
      profile.timezone || null,
      !!profile.consentGiven
    ];

    const result = await db.query(upsertSql, params);
    const user = result.rows[0];

      return res.sendSuccess({ user });
  } catch (err) {
    logger.error(sanitize({ msg: 'users.sync.error', err: err && err.message }));
    return res.sendError(ErrorCodes.INTERNAL_SERVER_ERROR, 'Failed to sync profile');
  }
});

module.exports = router;

// GET /users/lookup?phoneNumber=... or ?id=...
router.get('/lookup', async (req, res) => {
  try {
    const phone = (req.query.phoneNumber || req.query.phone || '').trim();
    const id = (req.query.id || '').trim();

    if (!phone && !id) {
      return res.sendError(ErrorCodes.MISSING_REQUIRED_FIELD, 'missing_lookup_identifier');
    }

    // If service token is configured, require matching X-Service-Token header
    const svcToken = process.env.SERVICE_TOKEN || '';
    const incoming = req.headers['x-service-token'] || '';
    if (svcToken && svcToken.length > 0 && incoming !== svcToken) {
      logger.warn({ msg: 'users.lookup: missing/invalid service token' });
      return res.sendError(ErrorCodes.UNAUTHORIZED, 'unauthorized');
    }

    const db = req.app.get('db');
    if (!db) return res.sendError(ErrorCodes.INTERNAL_SERVER_ERROR, 'Database not configured');

    let sql;
    let params = [];
    if (id) {
      sql = `SELECT id, phone_number, date_of_birth, time_of_birth, place_of_birth, lat, lon, timezone, consent_given, created_at, updated_at FROM users WHERE id = $1 LIMIT 1`;
      params = [id];
    } else {
      // Normalize phone by comparing only digits to allow flexible formatting ( +91-999... vs +91999... )
      sql = `SELECT id, phone_number, date_of_birth, time_of_birth, place_of_birth, lat, lon, timezone, consent_given, created_at, updated_at FROM users WHERE regexp_replace(phone_number, '[^0-9]', '', 'g') = regexp_replace($1, '[^0-9]', '', 'g') LIMIT 1`;
      params = [phone];
    }

    const result = await db.query(sql, params);
    if (!result || !result.rows || result.rows.length === 0) {
      return res.sendSuccess(null); // no user found, return ok with null data
    }

    let user = result.rows[0];

    // Respect consent: only return detailed PII if consent_given is true
    if (!user.consent_given) {
      user = {
        id: user.id,
        phone_number: user.phone_number,
        consent_given: !!user.consent_given,
        created_at: user.created_at,
        updated_at: user.updated_at
      };
    }

    return res.sendSuccess({ user });
  } catch (err) {
    logger.error(sanitize({ msg: 'users.lookup.error', err: err && err.message }));
    return res.sendError(ErrorCodes.INTERNAL_SERVER_ERROR, 'users_lookup_failed');
  }
});
