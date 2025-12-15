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
        is_paid, last_login_location, last_login_lat, last_login_lon,
        created_at, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now(), $9, $10, $11, $12, now(), now())
      ON CONFLICT (phone_number) DO UPDATE SET
        date_of_birth = EXCLUDED.date_of_birth,
        time_of_birth = EXCLUDED.time_of_birth,
        place_of_birth = EXCLUDED.place_of_birth,
        lat = EXCLUDED.lat,
        lon = EXCLUDED.lon,
        timezone = EXCLUDED.timezone,
        consent_given = EXCLUDED.consent_given,
        is_paid = COALESCE(EXCLUDED.is_paid, users.is_paid),
        last_login_location = COALESCE(EXCLUDED.last_login_location, users.last_login_location),
        last_login_lat = COALESCE(EXCLUDED.last_login_lat, users.last_login_lat),
        last_login_lon = COALESCE(EXCLUDED.last_login_lon, users.last_login_lon),
        updated_at = now()
      RETURNING id, phone_number, created_at, updated_at, is_paid, last_login_location, last_login_lat, last_login_lon
    `;

    const params = [
      profile.phoneNumber,
      profile.dateOfBirth || null,
      profile.timeOfBirth || null,
      profile.placeOfBirth || null,
      profile.lat ? parseFloat(profile.lat) : null,
      profile.lon ? parseFloat(profile.lon) : null,
      profile.timezone || null,
      !!profile.consentGiven,
      profile.isPaid === undefined ? false : !!profile.isPaid,
      profile.last_login_location || null,
      profile.last_login_lat ? parseFloat(profile.last_login_lat) : (profile.last_login_lat === 0 ? 0 : null),
      profile.last_login_lon ? parseFloat(profile.last_login_lon) : (profile.last_login_lon === 0 ? 0 : null)
    ];

    const result = await db.query(upsertSql, params);
    const user = result.rows[0];

      return res.sendSuccess({ user });
  } catch (err) {
    logger.error(sanitize({ msg: 'users.sync.error', err: err && err.message }));
    return res.sendError(ErrorCodes.INTERNAL_SERVER_ERROR, 'Failed to sync profile');
  }
});

// POST /users/identify
// Body: { phoneNumber: "+91-9899162012" }
// Returns { returning: true/false, user: {...} } if found
router.post('/identify', async (req, res) => {
  try {
    const phone = (req.body.phoneNumber || '').trim();

    if (!phone) {
      return res.sendError(ErrorCodes.MISSING_REQUIRED_FIELD, 'missing_phone_number');
    }

    const db = req.app.get('db');
    if (!db) return res.sendError(ErrorCodes.INTERNAL_SERVER_ERROR, 'Database not configured');

    // Normalize phone by comparing only digits
    const sql = `SELECT id, phone_number, name, date_of_birth, time_of_birth, place_of_birth, lat, lon, timezone, consent_given, is_paid, last_login_location, last_login_lat, last_login_lon, created_at, updated_at FROM users WHERE regexp_replace(phone_number, '[^0-9]', '', 'g') = regexp_replace($1, '[^0-9]', '', 'g') LIMIT 1`;
    const result = await db.query(sql, [phone]);

    if (!result || !result.rows || result.rows.length === 0) {
      return res.sendSuccess({ returning: false, user: null });
    }

    const user = result.rows[0];
    return res.sendSuccess({ 
      returning: true, 
        user: {
        id: user.id,
        phone_number: user.phone_number,
        name: user.name,
        date_of_birth: user.date_of_birth,
        time_of_birth: user.time_of_birth,
        place_of_birth: user.place_of_birth,
        lat: user.lat,
        lon: user.lon,
        timezone: user.timezone,
        consent_given: user.consent_given,
        is_paid: user.is_paid,
        last_login_location: user.last_login_location,
        last_login_lat: user.last_login_lat,
        last_login_lon: user.last_login_lon
      }
    });
  } catch (err) {
    logger.error(sanitize({ msg: 'users.identify.error', err: err && err.message }));
    return res.sendError(ErrorCodes.INTERNAL_SERVER_ERROR, 'users_identify_failed');
  }
});

// POST /users/profile
// Body: profile object for saving/updating user profile
router.post('/profile', async (req, res) => {
  try {
    const profile = req.body || {};
    if (!profile.phoneNumber) {
      return res.sendError(ErrorCodes.MISSING_REQUIRED_FIELD, 'missing_phone_number');
    }

    const db = req.app.get('db');
    if (!db) return res.sendError(ErrorCodes.INTERNAL_SERVER_ERROR, 'Database not configured');

    const upsertSql = `
      INSERT INTO users (
        phone_number, name, date_of_birth, time_of_birth, place_of_birth,
        lat, lon, timezone, consent_given, consent_date,
        is_paid, last_login_location, last_login_lat, last_login_lon,
        created_at, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, now(), now())
      ON CONFLICT (phone_number) DO UPDATE SET
        name = COALESCE(EXCLUDED.name, users.name),
        date_of_birth = COALESCE(EXCLUDED.date_of_birth, users.date_of_birth),
        time_of_birth = COALESCE(EXCLUDED.time_of_birth, users.time_of_birth),
        place_of_birth = COALESCE(EXCLUDED.place_of_birth, users.place_of_birth),
        lat = COALESCE(EXCLUDED.lat, users.lat),
        lon = COALESCE(EXCLUDED.lon, users.lon),
        timezone = COALESCE(EXCLUDED.timezone, users.timezone),
        consent_given = COALESCE(EXCLUDED.consent_given, users.consent_given),
        is_paid = COALESCE(EXCLUDED.is_paid, users.is_paid),
        last_login_location = COALESCE(EXCLUDED.last_login_location, users.last_login_location),
        last_login_lat = COALESCE(EXCLUDED.last_login_lat, users.last_login_lat),
        last_login_lon = COALESCE(EXCLUDED.last_login_lon, users.last_login_lon),
        updated_at = now()
      RETURNING id, phone_number, name, date_of_birth, time_of_birth, place_of_birth, lat, lon, timezone, consent_given, is_paid, last_login_location, last_login_lat, last_login_lon
    `;

    const params = [
      profile.phoneNumber,
      profile.name || null,
      profile.dateOfBirth || null,
      profile.timeOfBirth || null,
      profile.placeOfBirth || null,
      profile.lat ? parseFloat(profile.lat) : null,
      profile.lon ? parseFloat(profile.lon) : null,
      profile.timezone || null,
      profile.consentGiven !== undefined ? !!profile.consentGiven : null,
      profile.isPaid === undefined ? false : !!profile.isPaid,
      profile.last_login_location || null,
      profile.last_login_lat ? parseFloat(profile.last_login_lat) : (profile.last_login_lat === 0 ? 0 : null),
      profile.last_login_lon ? parseFloat(profile.last_login_lon) : (profile.last_login_lon === 0 ? 0 : null)
    ];

    const result = await db.query(upsertSql, params);
    const user = result.rows[0];

    // Normalize returned user object to include new fields
    const outUser = {
      id: user.id,
      phone_number: user.phone_number,
      name: user.name,
      date_of_birth: user.date_of_birth,
      time_of_birth: user.time_of_birth,
      place_of_birth: user.place_of_birth,
      lat: user.lat,
      lon: user.lon,
      timezone: user.timezone,
      consent_given: user.consent_given,
      is_paid: user.is_paid,
      last_login_location: user.last_login_location,
      last_login_lat: user.last_login_lat,
      last_login_lon: user.last_login_lon
    };

    return res.sendSuccess({ user: outUser });
  } catch (err) {
    logger.error(sanitize({ msg: 'users.profile.error', err: err && err.message }));
    return res.sendError(ErrorCodes.INTERNAL_SERVER_ERROR, 'Failed to save profile');
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
      sql = `SELECT id, phone_number, date_of_birth, time_of_birth, place_of_birth, lat, lon, timezone, consent_given, is_paid, last_login_location, last_login_lat, last_login_lon, created_at, updated_at FROM users WHERE id = $1 LIMIT 1`;
      params = [id];
    } else {
      // Normalize phone by comparing only digits to allow flexible formatting ( +91-999... vs +91999... )
      sql = `SELECT id, phone_number, date_of_birth, time_of_birth, place_of_birth, lat, lon, timezone, consent_given, is_paid, last_login_location, last_login_lat, last_login_lon, created_at, updated_at FROM users WHERE regexp_replace(phone_number, '[^0-9]', '', 'g') = regexp_replace($1, '[^0-9]', '', 'g') LIMIT 1`;
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
