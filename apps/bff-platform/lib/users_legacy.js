const express = require('express');
const router = express.Router();
const axios = require('axios');
const { logger, sanitize, ErrorCodes, config } = require('@niyati/commons');
const { classify, getQueryCreditCost, getQueryType } = require('./nlpClassifier');

// Cache for app_config values (refresh every 5 minutes)
let configCache = {};
let configCacheTime = 0;
const CONFIG_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

async function getAppConfig(db) {
  const now = Date.now();
  if (now - configCacheTime < CONFIG_CACHE_TTL && Object.keys(configCache).length > 0) {
    return configCache;
  }
  try {
    const result = await db.query('SELECT key, value FROM app_config');
    const cfg = {};
    for (const row of result.rows) {
      cfg[row.key] = row.value;
    }
    configCache = cfg;
    configCacheTime = now;
    return cfg;
  } catch (e) {
    logger.warn({ msg: 'Failed to load app_config, using defaults', err: e.message });
    return {
      credits_monthly_free: '10',
      credits_horoscope_cost: '2',
      credits_premium_cost: '4',
      credits_per_10_inr: '1',
      credits_low_threshold: '4',
      payment_amount_inr: '500'
    };
  }
}

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
    if (!profile.phoneNumber) {
      return res.sendError(ErrorCodes.MISSING_REQUIRED_FIELD, 'missing_phone');
    }

    const db = req.app.get('db');
    if (!db) return res.sendError(ErrorCodes.INTERNAL_SERVER_ERROR, 'Database not configured');

    const normalizedLastLoginLocation = (profile.last_login_location === undefined || profile.last_login_location === null) ? null : String(profile.last_login_location);
    const { computeIsAdult } = require('@niyati/commons').dateUtils;

    // Upsert into user_profiles
    const upsertProfileSql = `
      INSERT INTO user_profiles (user_id, phone_number, name, date_of_birth, time_of_birth, place_of_birth, lat, lon, timezone, consent_given, consent_date, last_login_location, last_login_lat, last_login_lon, is_adult, created_at, updated_at)
      VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, CASE WHEN $9 THEN now() ELSE NULL END, $10, $11, $12, $13, now(), now())
      ON CONFLICT (phone_number) DO UPDATE SET
        name = COALESCE(EXCLUDED.name, user_profiles.name),
        date_of_birth = COALESCE(EXCLUDED.date_of_birth, user_profiles.date_of_birth),
        time_of_birth = COALESCE(EXCLUDED.time_of_birth, user_profiles.time_of_birth),
        place_of_birth = COALESCE(EXCLUDED.place_of_birth, user_profiles.place_of_birth),
        lat = COALESCE(EXCLUDED.lat, user_profiles.lat),
        lon = COALESCE(EXCLUDED.lon, user_profiles.lon),
        timezone = COALESCE(EXCLUDED.timezone, user_profiles.timezone),
        consent_given = COALESCE(EXCLUDED.consent_given, user_profiles.consent_given),
        last_login_location = COALESCE(EXCLUDED.last_login_location, user_profiles.last_login_location),
        last_login_lat = COALESCE(EXCLUDED.last_login_lat, user_profiles.last_login_lat),
        last_login_lon = COALESCE(EXCLUDED.last_login_lon, user_profiles.last_login_lon),
        is_adult = COALESCE(EXCLUDED.is_adult, user_profiles.is_adult),
        updated_at = now()
      RETURNING user_id, phone_number, name, date_of_birth, time_of_birth, place_of_birth, lat, lon, timezone, consent_given, last_login_location, last_login_lat, last_login_lon, is_adult
    `;

    const profileParams = [
      profile.phoneNumber,
      profile.name || null,
      profile.dateOfBirth || null,
      profile.timeOfBirth || null,
      profile.placeOfBirth || null,
      profile.lat ? parseFloat(profile.lat) : null,
      profile.lon ? parseFloat(profile.lon) : null,
      profile.timezone || null,
      (typeof profile.consentGiven !== 'undefined') ? !!profile.consentGiven : null,
      normalizedLastLoginLocation,
      profile.last_login_lat ? parseFloat(profile.last_login_lat) : (profile.last_login_lat === 0 ? 0 : null),
      profile.last_login_lon ? parseFloat(profile.last_login_lon) : (profile.last_login_lon === 0 ? 0 : null),
      computeIsAdult(profile.dateOfBirth)
    ];

    let profileResult;
    try {
      profileResult = await db.query(upsertProfileSql, profileParams);
      if (!profileResult || !profileResult.rows || profileResult.rows.length === 0) {
        // Attempt legacy users table upsert when new table returns no rows
        const legacySql = `INSERT INTO users (phone_number, name, date_of_birth, time_of_birth, place_of_birth, last_login_location, credits, created_at, updated_at)
          VALUES ($1,$2,$3,$4,$5,$6,$7, now(), now())
          ON CONFLICT (phone_number) DO UPDATE SET
            name = COALESCE(EXCLUDED.name, users.name),
            date_of_birth = COALESCE(EXCLUDED.date_of_birth, users.date_of_birth),
            time_of_birth = COALESCE(EXCLUDED.time_of_time, users.time_of_time),
            place_of_birth = COALESCE(EXCLUDED.place_of_birth, users.place_of_birth),
            last_login_location = COALESCE(EXCLUDED.last_login_location, users.last_login_location),
            updated_at = now()
          RETURNING id AS user_id, phone_number, name, date_of_birth, time_of_birth, place_of_birth, credits, total_paid_amount, last_login_location, is_adult`;
        const legacyParams = [profile.phoneNumber, profile.name || null, profile.dateOfBirth || null, profile.timeOfBirth || null, profile.placeOfBirth || null, normalizedLastLoginLocation, 10];
        profileResult = await db.query(legacySql, legacyParams);
      }
    } catch (err) {
      logger.warn(sanitize({ msg: 'users.sync.profile_upsert_failed', err: err && err.message }));
      // Fallback to legacy users table for environments without new tables
      try {
        const legacySql = `INSERT INTO users (phone_number, name, date_of_birth, time_of_birth, place_of_birth, last_login_location, credits, created_at, updated_at)
          VALUES ($1,$2,$3,$4,$5,$6,$7, now(), now())
          ON CONFLICT (phone_number) DO UPDATE SET
            name = COALESCE(EXCLUDED.name, users.name),
            date_of_birth = COALESCE(EXCLUDED.date_of_birth, users.date_of_birth),
            time_of_birth = COALESCE(EXCLUDED.time_of_birth, users.time_of_birth),
            place_of_birth = COALESCE(EXCLUDED.place_of_birth, users.place_of_birth),
            last_login_location = COALESCE(EXCLUDED.last_login_location, users.last_login_location),
            updated_at = now()
          RETURNING id AS user_id, phone_number, name, date_of_birth, time_of_birth, place_of_birth, credits, total_paid_amount, last_login_location, is_adult`;
        const legacyParams = [profile.phoneNumber, profile.name || null, profile.dateOfBirth || null, profile.timeOfBirth || null, profile.placeOfBirth || null, normalizedLastLoginLocation, 10];
        profileResult = await db.query(legacySql, legacyParams);
      } catch (e2) {
        logger.error(sanitize({ msg: 'users.sync.profile_upsert_failed_legacy', err: e2 && e2.message }));
        return res.sendError(ErrorCodes.INTERNAL_SERVER_ERROR, 'profile_upsert_failed');
      }
    }

    const upsertCreditsSql = `
      INSERT INTO user_credits (user_id, credits, credits_last_reset, total_paid_amount, is_paid, last_payment_amount, last_payment_verified, upi_id, upi_txn_id, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, now(), now())
      ON CONFLICT (user_id) DO UPDATE SET
        credits = COALESCE(EXCLUDED.credits, user_credits.credits),
        credits_last_reset = COALESCE(EXCLUDED.credits_last_reset, user_credits.credits_last_reset),
        total_paid_amount = COALESCE(EXCLUDED.total_paid_amount, user_credits.total_paid_amount),
        is_paid = COALESCE(EXCLUDED.is_paid, user_credits.is_paid),
        last_payment_amount = COALESCE(EXCLUDED.last_payment_amount, user_credits.last_payment_amount),
        last_payment_verified = COALESCE(EXCLUDED.last_payment_verified, user_credits.last_payment_verified),
        upi_id = COALESCE(EXCLUDED.upi_id, user_credits.upi_id),
        upi_txn_id = COALESCE(EXCLUDED.upi_txn_id, user_credits.upi_txn_id),
        updated_at = now()
      RETURNING user_id, credits, total_paid_amount, is_paid, last_payment_amount, last_payment_verified, upi_id, upi_txn_id
    `;

    const creditsParams = [
      profileResult.rows[0].user_id,
      10,
      null,
      0,
      false,
      0,
      false,
      profile.upiId || null,
      profile.upiTxnId || null
    ];

    let creditsResult;
    try {
      creditsResult = await db.query(upsertCreditsSql, creditsParams);
      if (!creditsResult || !creditsResult.rows || creditsResult.rows.length === 0) {
        // Fallback: query legacy users table for credits
        try {
          const legacyCreditsSql = `SELECT id AS user_id, credits, total_paid_amount FROM users WHERE phone_number = $1 LIMIT 1`;
          const legacyRes = await db.query(legacyCreditsSql, [profileResult.rows[0].phone_number]);
          if (legacyRes && legacyRes.rows && legacyRes.rows.length > 0) {
            creditsResult = legacyRes;
          } else {
            creditsResult = { rows: [{ user_id: profileResult.rows[0].user_id, credits: 10, total_paid_amount: 0 }] };
          }
        } catch (e) {
          creditsResult = { rows: [{ user_id: profileResult.rows[0].user_id, credits: 10, total_paid_amount: 0 }] };
        }
      }
    } catch (err) {
      logger.warn(sanitize({ msg: 'users.sync.credits_upsert_failed', err: err && err.message }));
      // Fallback: query legacy users table for credits or use defaults
      try {
        const legacyCreditsSql = `SELECT id AS user_id, credits, total_paid_amount FROM users WHERE phone_number = $1 LIMIT 1`;
        const legacyRes = await db.query(legacyCreditsSql, [profileResult.rows[0].phone_number]);
        if (legacyRes && legacyRes.rows && legacyRes.rows.length > 0) {
          creditsResult = legacyRes;
        } else {
          creditsResult = { rows: [{ user_id: profileResult.rows[0].user_id, credits: 10, total_paid_amount: 0 }] };
        }
      } catch (e) {
        creditsResult = { rows: [{ user_id: profileResult.rows[0].user_id, credits: 10, total_paid_amount: 0 }] };
      }
    }

    try { console.log('NIYATI', `User synced ${profileResult.rows[0] && profileResult.rows[0].phone_number}`); } catch (e) { }

    return res.sendSuccess({ user: Object.assign({}, profileResult.rows[0], creditsResult.rows[0]) });
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

    // Prefer identity lookup from bff-auth internal API
    const BFF_AUTH_BASE = process.env.BFF_AUTH_BASE || 'http://bff-auth:3001/api/v1';
    const svcToken = process.env.SERVICE_TOKEN || '';
    let authUser = null;
    let db = req.app.get('db');
    try {
      const resp = await axios.get(`${BFF_AUTH_BASE.replace(/\/$/, '')}/internal/users/lookup`, { params: { phoneNumber: phone }, headers: svcToken ? { 'X-Service-Token': svcToken } : {} });
      if (resp && resp.data && resp.data.status && resp.data.data && resp.data.data.user) {
        authUser = resp.data.data.user;
      }
    } catch (err) {
      logger.warn({ msg: 'users.identify.auth_call_failed', err: err && err.message });
      // fall back to local DB lookup if auth service unreachable
      if (!db) db = req.app.get('db');
      if (db) {
        try {
          const fallback = await db.query(`SELECT up.user_id, up.phone_number, up.name, up.date_of_birth, up.time_of_birth, up.place_of_birth, up.lat, up.lon, up.timezone, up.consent_given, up.last_login_location, up.last_login_lat, up.last_login_lon, up.is_adult FROM user_profiles up WHERE regexp_replace(up.phone_number, '[^0-9]', '', 'g') = regexp_replace($1, '[^0-9]', '', 'g') LIMIT 1`, [phone]);
          const row = fallback && fallback.rows && fallback.rows[0];
          if (row) {
            authUser = {
              id: row.user_id || row.id,
              phone_number: row.phone_number,
              name: row.name,
              date_of_birth: row.date_of_birth,
              time_of_birth: row.time_of_birth,
              place_of_birth: row.place_of_birth,
              lat: row.lat,
              lon: row.lon,
              timezone: row.timezone,
              consent_given: row.consent_given,
              last_login_location: row.last_login_location,
              last_login_lat: row.last_login_lat,
              last_login_lon: row.last_login_lon,
              is_adult: typeof row.is_adult !== 'undefined' ? !!row.is_adult : null
            };
          }
        } catch (e) {
          logger.warn({ msg: 'users.identify.fallback_failed', err: e && e.message });
        }
      }
    }

    if (!authUser) {
      return res.sendSuccess({ returning: false, user: null });
    }

    if (!db) return res.sendError(ErrorCodes.INTERNAL_SERVER_ERROR, 'Database not configured');

    // Load configurable credits settings
    const appConfig = await getAppConfig(db);
    const monthlyCredits = parseInt(appConfig.credits_monthly_free, 10) || 10;

    // Find credits record via user_profiles.phone_number
    const creditsRes = await db.query(`SELECT uc.credits, uc.credits_last_reset, uc.total_paid_amount, uc.is_paid, uc.last_payment_amount, uc.last_payment_verified, uc.upi_id, uc.upi_txn_id, up.user_id FROM user_profiles up LEFT JOIN user_credits uc ON up.user_id = uc.user_id WHERE regexp_replace(up.phone_number, '[^0-9]', '', 'g') = regexp_replace($1, '[^0-9]', '', 'g') LIMIT 1`, [phone]);
    const creditsRow = creditsRes && creditsRes.rows && creditsRes.rows[0];

    let credits = monthlyCredits;
    if (creditsRow && typeof creditsRow.credits === 'number') credits = creditsRow.credits;

    const lastReset = creditsRow && creditsRow.credits_last_reset ? new Date(creditsRow.credits_last_reset) : new Date(0);
    const now = new Date();
    if (lastReset.getMonth() !== now.getMonth() || lastReset.getFullYear() !== now.getFullYear()) {
      credits = monthlyCredits;
      try {
        if (creditsRow && creditsRow.user_id) {
          await db.query('UPDATE user_credits SET credits = $1, credits_last_reset = now() WHERE user_id = $2', [monthlyCredits, creditsRow.user_id]);
        }
      } catch (e) { /* ignore */ }
    }

      return res.sendSuccess({
        returning: true,
        user: {
          id: authUser.id,
          phone_number: authUser.phone_number,
          name: authUser.name,
          date_of_birth: authUser.date_of_birth,
          time_of_birth: authUser.time_of_birth,
          place_of_birth: authUser.place_of_birth,
          lat: authUser.lat,
          lon: authUser.lon,
          timezone: authUser.timezone,
          consent_given: authUser.consent_given,
          credits: credits,
          total_paid_amount: creditsRow ? creditsRow.total_paid_amount || 0 : 0,
          is_paid: !!(creditsRow && creditsRow.is_paid),
          last_payment_amount: creditsRow ? creditsRow.last_payment_amount || 0 : 0,
          last_payment_verified: !!(creditsRow && creditsRow.last_payment_verified),
          upi_id: creditsRow ? creditsRow.upi_id || null : null,
          upi_txn_id: creditsRow ? creditsRow.upi_txn_id || null : null,
          last_login_location: authUser.last_login_location || null,
          last_login_lat: authUser.last_login_lat || null,
          last_login_lon: authUser.last_login_lon || null,
          is_adult: typeof authUser.is_adult !== 'undefined' ? !!authUser.is_adult : null
        },
        config: {
          credits_monthly_free: monthlyCredits,
        credits_horoscope_cost: parseInt(appConfig.credits_horoscope_cost, 10) || 2,
        credits_premium_cost: parseInt(appConfig.credits_premium_cost, 10) || 4,
        credits_low_threshold: parseInt(appConfig.credits_low_threshold, 10) || 4,
        payment_amount_inr: parseInt(appConfig.payment_amount_inr, 10) || 500
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

    // Upsert into user_profiles and user_credits (new ownership)
    const { computeIsAdult } = require('@niyati/commons').dateUtils;

    const normalizedLastLoginLocation = (profile.last_login_location === undefined || profile.last_login_location === null) ? null : String(profile.last_login_location);
    const upsertProfileSql = `
      INSERT INTO user_profiles (user_id, phone_number, name, date_of_birth, time_of_birth, place_of_birth, lat, lon, timezone, consent_given, consent_date, last_login_location, last_login_lat, last_login_lon, is_adult, created_at, updated_at)
      VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, CASE WHEN $9 THEN now() ELSE NULL END, $10, $11, $12, $13, now(), now())
      ON CONFLICT (phone_number) DO UPDATE SET
        name = COALESCE(EXCLUDED.name, user_profiles.name),
        date_of_birth = COALESCE(EXCLUDED.date_of_birth, user_profiles.date_of_birth),
        time_of_birth = COALESCE(EXCLUDED.time_of_birth, user_profiles.time_of_birth),
        place_of_birth = COALESCE(EXCLUDED.place_of_birth, user_profiles.place_of_birth),
        lat = COALESCE(EXCLUDED.lat, user_profiles.lat),
        lon = COALESCE(EXCLUDED.lon, user_profiles.lon),
        timezone = COALESCE(EXCLUDED.timezone, user_profiles.timezone),
        consent_given = COALESCE(EXCLUDED.consent_given, user_profiles.consent_given),
        last_login_location = COALESCE(EXCLUDED.last_login_location, user_profiles.last_login_location),
        last_login_lat = COALESCE(EXCLUDED.last_login_lat, user_profiles.last_login_lat),
        last_login_lon = COALESCE(EXCLUDED.last_login_lon, user_profiles.last_login_lon),
        is_adult = COALESCE(EXCLUDED.is_adult, user_profiles.is_adult),
        updated_at = now()
      RETURNING user_id, phone_number, name, date_of_birth, time_of_birth, place_of_birth, lat, lon, timezone, consent_given, last_login_location, last_login_lat, last_login_lon, is_adult
    `;

    const profileParams = [
      profile.phoneNumber,
      profile.name || null,
      profile.dateOfBirth || null,
      profile.timeOfBirth || null,
      profile.placeOfBirth || null,
      profile.lat ? parseFloat(profile.lat) : null,
      profile.lon ? parseFloat(profile.lon) : null,
      profile.timezone || null,
      profile.consentGiven !== undefined ? !!profile.consentGiven : null,
      normalizedLastLoginLocation,
      profile.last_login_lat ? parseFloat(profile.last_login_lat) : (profile.last_login_lat === 0 ? 0 : null),
      profile.last_login_lon ? parseFloat(profile.last_login_lon) : (profile.last_login_lon === 0 ? 0 : null),
      computeIsAdult(profile.dateOfBirth)
    ];

    let profileResult;
    try {
      profileResult = await db.query(upsertProfileSql, profileParams);
    } catch (err) {
      logger.warn(sanitize({ msg: 'users.profile.profile_upsert_failed', err: err && err.message }));
      // Fallback to legacy users table
      try {
        const legacySql = `INSERT INTO users (phone_number, name, date_of_birth, time_of_birth, place_of_birth, last_login_location, credits, created_at, updated_at)
          VALUES ($1,$2,$3,$4,$5,$6,$7, now(), now())
          ON CONFLICT (phone_number) DO UPDATE SET
            name = COALESCE(EXCLUDED.name, users.name),
            date_of_birth = COALESCE(EXCLUDED.date_of_birth, users.date_of_birth),
            time_of_birth = COALESCE(EXCLUDED.time_of_birth, users.time_of_birth),
            place_of_birth = COALESCE(EXCLUDED.place_of_birth, users.place_of_birth),
            last_login_location = COALESCE(EXCLUDED.last_login_location, users.last_login_location),
            updated_at = now()
          RETURNING id AS user_id, phone_number, name, date_of_birth, time_of_birth, place_of_birth, credits, total_paid_amount, last_login_location, is_adult`;
        const legacyParams = [profile.phoneNumber, profile.name || null, profile.dateOfBirth || null, profile.timeOfBirth || null, profile.placeOfBirth || null, normalizedLastLoginLocation, 10];
        profileResult = await db.query(legacySql, legacyParams);
      } catch (e2) {
        logger.error(sanitize({ msg: 'users.profile.profile_upsert_failed_legacy', err: e2 && e2.message }));
        return res.sendError(ErrorCodes.INTERNAL_SERVER_ERROR, 'profile_upsert_failed');
      }
    }

    const upsertCreditsSql = `
      INSERT INTO user_credits (user_id, credits, credits_last_reset, total_paid_amount, is_paid, last_payment_amount, last_payment_verified, upi_id, upi_txn_id, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, now(), now())
      ON CONFLICT (user_id) DO UPDATE SET
        credits = COALESCE(EXCLUDED.credits, user_credits.credits),
        credits_last_reset = COALESCE(EXCLUDED.credits_last_reset, user_credits.credits_last_reset),
        total_paid_amount = COALESCE(EXCLUDED.total_paid_amount, user_credits.total_paid_amount),
        is_paid = COALESCE(EXCLUDED.is_paid, user_credits.is_paid),
        last_payment_amount = COALESCE(EXCLUDED.last_payment_amount, user_credits.last_payment_amount),
        last_payment_verified = COALESCE(EXCLUDED.last_payment_verified, user_credits.last_payment_verified),
        upi_id = COALESCE(EXCLUDED.upi_id, user_credits.upi_id),
        upi_txn_id = COALESCE(EXCLUDED.upi_txn_id, user_credits.upi_txn_id),
        updated_at = now()
      RETURNING user_id, credits, total_paid_amount, is_paid, last_payment_amount, last_payment_verified, upi_id, upi_txn_id
    `;

    const creditsParams = [
      profileResult.rows[0].user_id,
      10,
      null,
      0,
      false,
      0,
      false,
      profile.upiId || null,
      profile.upiTxnId || null
    ];

    let creditsResult;
    try {
      creditsResult = await db.query(upsertCreditsSql, creditsParams);
      if (!creditsResult || !creditsResult.rows || creditsResult.rows.length === 0) {
        // Fallback: query legacy users table for credits
        try {
          const legacyCreditsSql = `SELECT id AS user_id, credits, total_paid_amount FROM users WHERE phone_number = $1 LIMIT 1`;
          const legacyRes = await db.query(legacyCreditsSql, [profileResult.rows[0].phone_number]);
          if (legacyRes && legacyRes.rows && legacyRes.rows.length > 0) {
            creditsResult = legacyRes;
          } else {
            creditsResult = { rows: [{ user_id: profileResult.rows[0].user_id, credits: 10, total_paid_amount: 0 }] };
          }
        } catch (e) {
          creditsResult = { rows: [{ user_id: profileResult.rows[0].user_id, credits: 10, total_paid_amount: 0 }] };
        }
      }
    } catch (err) {
      logger.warn(sanitize({ msg: 'users.profile.credits_upsert_failed', err: err && err.message }));
      // Fallback: query legacy users table for credits or use defaults
      try {
        const legacyCreditsSql = `SELECT id AS user_id, credits, total_paid_amount FROM users WHERE phone_number = $1 LIMIT 1`;
        const legacyRes = await db.query(legacyCreditsSql, [profileResult.rows[0].phone_number]);
        if (legacyRes && legacyRes.rows && legacyRes.rows.length > 0) {
          creditsResult = legacyRes;
        } else {
          creditsResult = { rows: [{ user_id: profileResult.rows[0].user_id, credits: 10, total_paid_amount: 0 }] };
        }
      } catch (e) {
        creditsResult = { rows: [{ user_id: profileResult.rows[0].user_id, credits: 10, total_paid_amount: 0 }] };
      }
    }

    try { console.log('NIYATI', `Profile saved for ${profileResult.rows[0] && profileResult.rows[0].phone_number}`); } catch (e) { }
    return res.sendSuccess({ user: Object.assign({}, profileResult.rows[0], creditsResult.rows[0]) });
  } catch (err) {
    logger.error(sanitize({ msg: 'users.profile.error', err: err && err.message }));
    return res.sendError(ErrorCodes.INTERNAL_SERVER_ERROR, 'Failed to save profile');
  }
});


// GET /users/lookup?phoneNumber=... or ?id=...
router.get('/lookup', async (req, res) => {
  try {
    const phone = (req.query.phoneNumber || req.query.phone || '').trim();
    const id = (req.query.id || '').trim();
    if (!phone && !id) return res.sendError(ErrorCodes.MISSING_REQUIRED_FIELD, 'missing_lookup_identifier');

    // Prefer identity lookups from bff-auth internal API to centralize PII
    const BFF_AUTH_BASE = process.env.BFF_AUTH_BASE || 'http://bff-auth:3001/api/v1';
    const svcToken = process.env.SERVICE_TOKEN || '';

    try {
      if (id) {
        const resp = await axios.get(`${BFF_AUTH_BASE.replace(/\/$/, '')}/internal/users/${encodeURIComponent(id)}`, { headers: svcToken ? { 'X-Service-Token': svcToken } : {} });
        if (!resp || !resp.data || !resp.data.status) return res.sendSuccess({ user: null });
        const user = resp.data.data ? resp.data.data.user : null;
        return res.sendSuccess({ user });
      }

      const resp = await axios.get(`${BFF_AUTH_BASE.replace(/\/$/, '')}/internal/users/lookup`, { params: { phoneNumber: phone }, headers: svcToken ? { 'X-Service-Token': svcToken } : {} });
      if (!resp || !resp.data || !resp.data.status) return res.sendSuccess({ user: null });
      const user = resp.data.data ? resp.data.data.user : null;
      return res.sendSuccess({ user });
    } catch (err) {
      logger.warn({ msg: 'users.lookup.auth_call_failed', err: err && err.message });
      // Fall back to local DB lookup for resilience if auth service unreachable
      const db = req.app.get('db');
      if (!db) return res.sendError(ErrorCodes.INTERNAL_SERVER_ERROR, 'Database not configured');
      // Fallback: do minimal lookup in legacy users table if present
      try {
        let sql;
        let params = [];
        if (id) {
          sql = `SELECT id, phone_number, name, date_of_birth, time_of_birth, place_of_birth, lat, lon, timezone, consent_given, created_at, updated_at FROM users WHERE id = $1 LIMIT 1`;
          params = [id];
        } else {
          sql = `SELECT id, phone_number, name, date_of_birth, time_of_birth, place_of_birth, lat, lon, timezone, consent_given, created_at, updated_at FROM users WHERE regexp_replace(phone_number, '[^0-9]', '', 'g') = regexp_replace($1, '[^0-9]', '', 'g') LIMIT 1`;
          params = [phone];
        }
        const result = await db.query(sql, params);
        if (!result || !result.rows || result.rows.length === 0) return res.sendSuccess({ user: null });
        const user = result.rows[0];
        if (!user.consent_given) {
          return res.sendSuccess({ user: { id: user.id, phone_number: user.phone_number, consent_given: !!user.consent_given, created_at: user.created_at, updated_at: user.updated_at } });
        }
        return res.sendSuccess({ user });
      } catch (e) {
        logger.error(sanitize({ msg: 'users.lookup.fallback_failed', err: e && e.message }));
        return res.sendError(ErrorCodes.INTERNAL_SERVER_ERROR, 'users_lookup_failed');
      }
    }
  } catch (err) {
    logger.error(sanitize({ msg: 'users.lookup.error', err: err && err.message }));
    return res.sendError(ErrorCodes.INTERNAL_SERVER_ERROR, 'users_lookup_failed');
  }
});

// POST /users/deduct-credits
// Body: { phoneNumber: "+91-9899162012", amount: 2, queryType: "horoscope" | "premium" }
// Deducts credits after a successful query response
router.post('/deduct-credits', async (req, res) => {
  try {
    const phone = (req.body.phoneNumber || '').trim();
    const amount = parseInt(req.body.amount, 10) || 2;
    // Prefer explicit idempotency key header, fallback to x-request-id or body.requestId
      const incomingReqId = ((req.headers && (req.headers['x-idempotency-key'] || req.headers['x-request-id'])) || req.body.requestId || '').toString().trim();
    // Protect against accidental deductions when the assistant asked for clarification
    const headerNeedsClar = req.headers && (String(req.headers['x-needs-clarification']).toLowerCase() === '1' || String(req.headers['x-needs-clarification']).toLowerCase() === 'true');
    const isClarification = (req.body && (req.body.isClarification === true || req.body.isClarifying === true)) || headerNeedsClar;
    if (isClarification) {
      logger.warn({ msg: 'deduct_credits_blocked_clarification', phone, reqId: incomingReqId });
      return res.sendError(ErrorCodes.BAD_REQUEST, 'clarification_no_deduct');
    }

    if (!phone) {
      return res.sendError(ErrorCodes.MISSING_REQUIRED_FIELD, 'missing_phone_number');
    }

    const db = req.app.get('db');
    if (!db) return res.sendError(ErrorCodes.INTERNAL_SERVER_ERROR, 'Database not configured');

    // If no idempotency key provided, fall back to simple update (non-idempotent)
    if (!incomingReqId) {
      try {
          const sql = `
            UPDATE user_credits 
            SET credits = GREATEST(credits - $2, 0), updated_at = now()
            WHERE user_id = (
              SELECT user_id FROM user_profiles WHERE regexp_replace(phone_number, '[^0-9]', '', 'g') = regexp_replace($1, '[^0-9]', '', 'g') LIMIT 1
            )
            RETURNING user_id AS id, credits, total_paid_amount
          `;
        const result = await db.query(sql, [phone, amount]);
        if (!result || !result.rows || result.rows.length === 0) {
          // Try legacy users table update as a fallback
          try {
            const legacySql = `UPDATE users SET credits = GREATEST(credits - $2, 0), updated_at = now() WHERE regexp_replace(phone_number, '[^0-9]', '', 'g') = regexp_replace($1, '[^0-9]', '', 'g') RETURNING id AS user_id, credits, total_paid_amount`;
            const legacyRes = await db.query(legacySql, [phone, amount]);
            if (!legacyRes || !legacyRes.rows || legacyRes.rows.length === 0) {
              return res.sendError(ErrorCodes.NOT_FOUND, 'user_not_found');
            }
            const user = legacyRes.rows[0];
            logger.info({ msg: 'credits_deducted_no_idempotency_legacy', phone, amount, creditsAfter: user.credits });
            return res.sendSuccess({ credits: user.credits, totalPaidAmount: user.total_paid_amount });
          } catch (e) {
            return res.sendError(ErrorCodes.NOT_FOUND, 'user_not_found');
          }
        }
        const user = result.rows[0];
        logger.info({ msg: 'credits_deducted_no_idempotency', phone, amount, creditsAfter: user.credits });
        return res.sendSuccess({ credits: user.credits, totalPaidAmount: user.total_paid_amount });
      } catch (e) {
        logger.error({ msg: 'deduct_credits_failed', err: e && e.message, phone, amount });
        return res.sendError(ErrorCodes.INTERNAL_SERVER_ERROR, 'deduct_credits_failed');
      }
    }

    // Idempotent flow using charge_transactions table (best-effort; if table missing, fallback)
    try {
      // Check if transaction exists
      const checkSql = `SELECT id, request_id, phone_number, amount, status, credits_after, created_at FROM charge_transactions WHERE request_id = $1 LIMIT 1`;
      const existing = await db.query(checkSql, [incomingReqId]);
      if (existing && existing.rows && existing.rows.length > 0) {
        const tx = existing.rows[0];
        logger.info({ msg: 'deduct_credits_idempotent_hit', reqId: incomingReqId, phone });
        return res.sendSuccess({ credits: tx.credits_after, alreadyApplied: tx.status === 'applied' });
      }

      // Start transaction: insert pending tx, apply deduction, update tx
      await db.query('BEGIN');
      const insertSql = `INSERT INTO charge_transactions (request_id, phone_number, amount, status, created_at) VALUES ($1, $2, $3, 'pending', now()) RETURNING id`;
      await db.query(insertSql, [incomingReqId, phone, amount]);

        const updateSql = `
          UPDATE user_credits 
          SET credits = GREATEST(credits - $2, 0), updated_at = now()
          WHERE user_id = (
            SELECT user_id FROM user_profiles WHERE regexp_replace(phone_number, '[^0-9]', '', 'g') = regexp_replace($1, '[^0-9]', '', 'g') LIMIT 1
          )
          RETURNING user_id AS id, credits, total_paid_amount
        `;
      const result = await db.query(updateSql, [phone, amount]);
      if (!result || !result.rows || result.rows.length === 0) {
        await db.query('ROLLBACK');
        // Attempt legacy users table update as fallback
        try {
          const legacySql = `UPDATE users SET credits = GREATEST(credits - $2, 0), updated_at = now() WHERE regexp_replace(phone_number, '[^0-9]', '', 'g') = regexp_replace($1, '[^0-9]', '', 'g') RETURNING id AS user_id, credits, total_paid_amount`;
          const legacyRes = await db.query(legacySql, [phone, amount]);
          if (!legacyRes || !legacyRes.rows || legacyRes.rows.length === 0) {
            return res.sendError(ErrorCodes.NOT_FOUND, 'user_not_found');
          }
          const user = legacyRes.rows[0];
          logger.info({ msg: 'deduct_credits_legacy_applied_after_idempotent', phone, amount, creditsAfter: user.credits });
          return res.sendSuccess({ credits: user.credits, totalPaidAmount: user.total_paid_amount });
        } catch (e) {
          return res.sendError(ErrorCodes.NOT_FOUND, 'user_not_found');
        }
      }
      const user = result.rows[0];

      const finalizeSql = `UPDATE charge_transactions SET status = 'applied', credits_after = $3 WHERE request_id = $1`;
      await db.query(finalizeSql, [incomingReqId, phone, user.credits]);
      await db.query('COMMIT');

      logger.info({ msg: 'deduct_credits_applied', reqId: incomingReqId, phone, amount, creditsAfter: user.credits });
      return res.sendSuccess({ credits: user.credits, totalPaidAmount: user.total_paid_amount });
    } catch (e) {
      try { await db.query('ROLLBACK'); } catch (e2) { }
      // If anything goes wrong with the idempotent path, attempt a best-effort
      // non-idempotent fallback to ensure users are not charged twice due to
      // unexpected DB/state errors. Log the original error for investigation.
      logger.warn({ msg: 'deduct_credits_idempotent_error', err: e && e.message, phone, reqId: incomingReqId });
      try {
          const sql = `
            UPDATE user_credits 
            SET credits = GREATEST(credits - $2, 0), updated_at = now()
            WHERE user_id = (
              SELECT user_id FROM user_profiles WHERE regexp_replace(phone_number, '[^0-9]', '', 'g') = regexp_replace($1, '[^0-9]', '', 'g') LIMIT 1
            )
            RETURNING user_id AS id, credits, total_paid_amount
          `;
        let result = await db.query(sql, [phone, amount]);
        if (!result || !result.rows || result.rows.length === 0) {
          // Try legacy users table update
          try {
            const legacySql = `UPDATE users SET credits = GREATEST(credits - $2, 0), updated_at = now() WHERE regexp_replace(phone_number, '[^0-9]', '', 'g') = regexp_replace($1, '[^0-9]', '', 'g') RETURNING id AS user_id, credits, total_paid_amount`;
            const legacyRes = await db.query(legacySql, [phone, amount]);
            if (!legacyRes || !legacyRes.rows || legacyRes.rows.length === 0) {
              return res.sendError(ErrorCodes.NOT_FOUND, 'user_not_found');
            }
            const user = legacyRes.rows[0];
            logger.info({ msg: 'deduct_credits_fallback_applied_legacy', phone, amount, creditsAfter: user.credits });
            return res.sendSuccess({ credits: user.credits, totalPaidAmount: user.total_paid_amount });
          } catch (e3) {
            return res.sendError(ErrorCodes.NOT_FOUND, 'user_not_found');
          }
        }
        const user = result.rows[0];
        logger.info({ msg: 'deduct_credits_fallback_applied', phone, amount, creditsAfter: user.credits });
        return res.sendSuccess({ credits: user.credits, totalPaidAmount: user.total_paid_amount });
      } catch (e3) {
        logger.error({ msg: 'deduct_credits_fallback_failed', err: e3 && e3.message });
        return res.sendError(ErrorCodes.INTERNAL_SERVER_ERROR, 'deduct_credits_failed');
      }
    }
  } catch (err) {
    logger.error(sanitize({ msg: 'users.deduct-credits.error', err: err && err.message }));
    return res.sendError(ErrorCodes.INTERNAL_SERVER_ERROR, 'deduct_credits_failed');
  }
});

// POST /users/can-ask
// Body: { phoneNumber, question }
// Returns whether the user is allowed to ask the question and the cost
router.post('/can-ask', async (req, res) => {
  try {
    const phone = (req.body.phoneNumber || '').trim();
    const question = (req.body.question || '').trim();
    if (!phone) return res.sendError(ErrorCodes.MISSING_REQUIRED_FIELD, 'missing_phone_number');

    const db = req.app.get('db');
    if (!db) return res.sendError(ErrorCodes.INTERNAL_SERVER_ERROR, 'Database not configured');

    const appConfig = await getAppConfig(db);

    // Normalize config values to integers for classifier
    const parsedConfig = {
      credits_horoscope_cost: parseInt(appConfig.credits_horoscope_cost, 10) || 2,
      credits_premium_cost: parseInt(appConfig.credits_premium_cost, 10) || 4
    };

    // Determine temporal type (today|future) and credit cost (uses centralized classifier)
    const qType = classify(question || ''); // 'today' | 'future'
    const cost = parseInt(getQueryCreditCost(question || '', parsedConfig), 10) || 0;

    const userRes = await db.query(`SELECT credits, is_paid FROM users WHERE regexp_replace(phone_number, '[^0-9]', '', 'g') = regexp_replace($1, '[^0-9]', '', 'g') LIMIT 1`, [phone]);
    const user = userRes && userRes.rows && userRes.rows[0];

    if (!user) {
      // New user: allow today's questions or casual (cost 0) queries; no deduction yet
      return res.sendSuccess({ allowed: qType === 'today' || cost === 0, cost, qType });
    }

    const credits = typeof user.credits === 'number' ? user.credits : 0;

    // If query is free (casual), allow regardless of credit count
    if (cost > 0) {
      if (credits <= 0) {
        return res.sendSuccess({ allowed: false, reason: 'exhausted_credits', message: 'You have exhausted your credits for this month. Consider upgrading to paid subscription to continue asking questions.' });
      }

      if (credits < cost) {
        return res.sendSuccess({ allowed: false, reason: 'insufficient_credits', message: 'You have insufficient credits to ask this question. Upgrade to paid subscription to continue asking questions.' });
      }
    }

    // Users with <=10 credits can only ask 'today' questions
    if (credits <= 10 && qType === 'future') {
      return res.sendSuccess({ allowed: false, reason: 'low_credits_restricts_future', message: 'With low credits you may only ask questions about today.' });
    }

    // Future questions allowed only for paid users
    if (qType === 'future' && !user.is_paid) {
      return res.sendSuccess({ allowed: false, reason: 'future_only_for_paid', message: 'Future predictions are for paid users only. Please upgrade.' });
    }

    return res.sendSuccess({ allowed: true, cost, qType });
  } catch (err) {
    logger.error(sanitize({ msg: 'users.can-ask.error', err: err && err.message }));
    return res.sendError(ErrorCodes.INTERNAL_SERVER_ERROR, 'can_ask_failed');
  }
});

// POST /users/add-credits
// Body: { phoneNumber: "+91-9899162012", amount: 500 } (amount in INR)
// Adds credits after payment verification (configurable credits per ₹10)
router.post('/add-credits', async (req, res) => {
  try {
    const phone = (req.body.phoneNumber || '').trim();
    const amountINR = parseInt(req.body.amount, 10) || 0;

    if (!phone) {
      return res.sendError(ErrorCodes.MISSING_REQUIRED_FIELD, 'missing_phone_number');
    }

    const db = req.app.get('db');
    if (!db) return res.sendError(ErrorCodes.INTERNAL_SERVER_ERROR, 'Database not configured');

    // Get configurable credits per ₹10
    const appConfig = await getAppConfig(db);
    const creditsPerTenINR = parseInt(appConfig.credits_per_10_inr, 10) || 1;
    const creditsToAdd = Math.floor(amountINR / 10) * creditsPerTenINR;

    if (creditsToAdd <= 0) {
      return res.sendError(ErrorCodes.BAD_REQUEST, 'invalid_amount');
    }

    const upiId = (req.body.upiId || '').trim() || null;
    const upiTxnId = (req.body.upiTxnId || '').trim() || null;

    // Mark user as paid on first successful add-credits and record payment meta.
    const sql = `
      UPDATE users 
      SET credits = credits + $2, total_paid_amount = total_paid_amount + $3, is_paid = TRUE, last_payment_amount = $3, last_payment_verified = TRUE, upi_id = $4, upi_txn_id = $5, updated_at = now()
      WHERE regexp_replace(phone_number, '[^0-9]', '', 'g') = regexp_replace($1, '[^0-9]', '', 'g')
      RETURNING id, credits, total_paid_amount, is_paid, last_payment_amount, last_payment_verified, upi_id, upi_txn_id
    `;

    const result = await db.query(sql, [phone, creditsToAdd, amountINR, upiId, upiTxnId]);
    if (!result || !result.rows || result.rows.length === 0) {
      return res.sendError(ErrorCodes.NOT_FOUND, 'user_not_found');
    }

    const user = result.rows[0];
    return res.sendSuccess({
      credits: user.credits,
      creditsAdded: creditsToAdd,
      totalPaidAmount: user.total_paid_amount,
      is_paid: !!user.is_paid,
      last_payment_amount: user.last_payment_amount || 0,
      last_payment_verified: !!user.last_payment_verified,
      upi_id: user.upi_id || null,
      upi_txn_id: user.upi_txn_id || null
    });
  } catch (err) {
    logger.error(sanitize({ msg: 'users.add-credits.error', err: err && err.message }));
    return res.sendError(ErrorCodes.INTERNAL_SERVER_ERROR, 'add_credits_failed');
  }
});

// GET /users/config
// Returns configurable credits settings for the UI
router.get('/config', async (req, res) => {
  try {
    const db = req.app.get('db');
    if (!db) return res.sendError(ErrorCodes.INTERNAL_SERVER_ERROR, 'Database not configured');

    const appConfig = await getAppConfig(db);

    return res.sendSuccess({
      credits_monthly_free: parseInt(appConfig.credits_monthly_free, 10) || 10,
      credits_horoscope_cost: parseInt(appConfig.credits_horoscope_cost, 10) || 2,
      credits_premium_cost: parseInt(appConfig.credits_premium_cost, 10) || 4,
      credits_low_threshold: parseInt(appConfig.credits_low_threshold, 10) || 4,
      payment_amount_inr: parseInt(appConfig.payment_amount_inr, 10) || 500
    });
  } catch (err) {
    logger.error(sanitize({ msg: 'users.config.error', err: err && err.message }));
    return res.sendError(ErrorCodes.INTERNAL_SERVER_ERROR, 'config_fetch_failed');
  }
});

module.exports = router;

