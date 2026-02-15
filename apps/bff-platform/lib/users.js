const express = require('express');
const router = express.Router();
const axios = require('axios');
const commons = require('@niyati/commons');
const { logger, sanitize, ErrorCodes, config } = commons;
const { classify, getQueryCreditCost, getQueryType } = require('./nlpClassifier');

// Auth middleware for sensitive routes (deduct-credits, add-credits, profile)
// Falls back to passthrough only if authenticateOrReject is not available (e.g. misconfigured commons)
const authMiddleware = commons.authenticateOrReject || ((req, res, next) => next());

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
      logger.warn({ msg: 'users.sync.unauthorized', service: 'bff-platform' });
      return res.sendError(ErrorCodes.UNAUTHORIZED, 'unauthorized');
    }

    const profile = req.body || {};
    if (!profile.phoneNumber) {
      return res.sendError(ErrorCodes.MISSING_REQUIRED_FIELD, 'missing_phone');
    }

    const db = req.app.get('db');
    if (!db) return res.sendError(ErrorCodes.INTERNAL_SERVER_ERROR, 'Database not configured');

    // Validate date of birth if provided
    const { computeIsAdult, validateDateOfBirth } = require('@niyati/commons').dateUtils;
    if (profile.dateOfBirth) {
      const dobCheck = validateDateOfBirth(profile.dateOfBirth);
      if (!dobCheck.valid) {
        const errorCode = dobCheck.code === 'PROFILE_003' ? ErrorCodes.PROFILE_UNDERAGE : ErrorCodes.PROFILE_INVALID_DOB;
        return res.sendError(errorCode, dobCheck.message);
      }
    }

    const normalizedLastLoginLocation = (profile.last_login_location === undefined || profile.last_login_location === null) ? null : String(profile.last_login_location);

    // Upsert into user_profiles (bff-platform owns profile data)
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

    const profileResult = await db.query(upsertProfileSql, profileParams);
    if (!profileResult || !profileResult.rows || profileResult.rows.length === 0) {
      logger.error({ msg: 'users.sync.profile_upsert_returned_empty', phone: profile.phoneNumber });
      return res.sendError(ErrorCodes.INTERNAL_SERVER_ERROR, 'profile_upsert_failed');
    }

    // Upsert into user_credits (bff-platform owns billing/credits)
    // Note: On UPDATE we preserve existing credits (don't overwrite with default 10)
    // Credits are only set to default 10 on initial INSERT
    const upsertCreditsSql = `
      INSERT INTO user_credits (user_id, credits, credits_last_reset, total_paid_amount, is_paid, last_payment_amount, last_payment_verified, upi_id, upi_txn_id, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, now(), now())
      ON CONFLICT (user_id) DO UPDATE SET
        credits = user_credits.credits,
        credits_last_reset = COALESCE(user_credits.credits_last_reset, EXCLUDED.credits_last_reset),
        total_paid_amount = COALESCE(user_credits.total_paid_amount, EXCLUDED.total_paid_amount),
        is_paid = COALESCE(user_credits.is_paid, EXCLUDED.is_paid),
        last_payment_amount = COALESCE(user_credits.last_payment_amount, EXCLUDED.last_payment_amount),
        last_payment_verified = COALESCE(user_credits.last_payment_verified, EXCLUDED.last_payment_verified),
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

    const creditsResult = await db.query(upsertCreditsSql, creditsParams);
    if (!creditsResult || !creditsResult.rows || creditsResult.rows.length === 0) {
      logger.error({ msg: 'users.sync.credits_upsert_returned_empty', phone: profile.phoneNumber, user_id: profileResult.rows[0].user_id });
      return res.sendError(ErrorCodes.INTERNAL_SERVER_ERROR, 'credits_upsert_failed');
    }

    logger.info({ msg: 'users.sync.success', phone: profile.phoneNumber, user_id: profileResult.rows[0].user_id });
    return res.sendSuccess({ user: Object.assign({}, profileResult.rows[0], creditsResult.rows[0]) });
  } catch (err) {
    logger.error(sanitize({ msg: 'users.sync.error', err: err && err.message, stack: err && err.stack }));
    return res.sendError(ErrorCodes.INTERNAL_SERVER_ERROR, 'Failed to sync profile');
  }
});

// POST /users/identify
// Body: { phoneNumber: "+91-9899162012" }
// Returns { returning: true/false, user: {...} } if found
// Identity data comes from bff-auth; credits data from bff-platform
router.post('/identify', async (req, res) => {
  try {
    const phone = (req.body.phoneNumber || '').trim();

    if (!phone) {
      return res.sendError(ErrorCodes.MISSING_REQUIRED_FIELD, 'missing_phone_number');
    }

    // Identity lookup from bff-auth internal API (single source of truth for PII)
    const BFF_AUTH_BASE = process.env.BFF_AUTH_BASE
      || (process.env.BFF_AUTH_URL ? `${process.env.BFF_AUTH_URL.replace(/\/$/, '')}/api/v1` : null)
      || 'http://bff-auth:3001/api/v1';
    const svcToken = process.env.SERVICE_TOKEN || '';
    let authUser = null;
    
    try {
      const resp = await axios.get(`${BFF_AUTH_BASE.replace(/\/$/, '')}/internal/users/lookup`, { 
        params: { phoneNumber: phone }, 
        headers: svcToken ? { 'X-Service-Token': svcToken } : {},
        timeout: 5000
      });
      if (resp && resp.data && resp.data.status && resp.data.data && resp.data.data.user) {
        authUser = resp.data.data.user;
        logger.debug({ msg: 'users.identify.auth_lookup_success', phone });
      }
    } catch (err) {
      logger.error({ msg: 'users.identify.auth_call_failed', err: err && err.message, phone });
      return res.sendError(ErrorCodes.SERVICE_UNAVAILABLE, 'auth_service_unavailable');
    }

    if (!authUser) {
      return res.sendSuccess({ returning: false, user: null });
    }

    const db = req.app.get('db');
    if (!db) return res.sendError(ErrorCodes.INTERNAL_SERVER_ERROR, 'Database not configured');

    // Load configurable credits settings
    const appConfig = await getAppConfig(db);
    const monthlyCredits = parseInt(appConfig.credits_monthly_free, 10) || 10;

    // Find credits record via user_profiles.phone_number LEFT JOIN user_credits
    const creditsRes = await db.query(`
      SELECT uc.credits, uc.credits_last_reset, uc.total_paid_amount, uc.is_paid, uc.last_payment_amount, uc.last_payment_verified, uc.upi_id, uc.upi_txn_id, up.user_id 
      FROM user_profiles up 
      LEFT JOIN user_credits uc ON up.user_id = uc.user_id 
      WHERE regexp_replace(up.phone_number, '[^0-9]', '', 'g') = regexp_replace($1, '[^0-9]', '', 'g') 
      LIMIT 1
    `, [phone]);
    const creditsRow = creditsRes && creditsRes.rows && creditsRes.rows[0];

    let credits = monthlyCredits;
    if (creditsRow && typeof creditsRow.credits === 'number') credits = creditsRow.credits;

    // Check if monthly reset is needed
    const lastReset = creditsRow && creditsRow.credits_last_reset ? new Date(creditsRow.credits_last_reset) : new Date(0);
    const now = new Date();
    if (lastReset.getMonth() !== now.getMonth() || lastReset.getFullYear() !== now.getFullYear()) {
      credits = monthlyCredits;
      if (creditsRow && creditsRow.user_id) {
        await db.query('UPDATE user_credits SET credits = $1, credits_last_reset = now() WHERE user_id = $2', [monthlyCredits, creditsRow.user_id]);
        logger.info({ msg: 'users.identify.monthly_reset', phone, credits: monthlyCredits, user_id: creditsRow.user_id });
      }
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
    logger.error(sanitize({ msg: 'users.identify.error', err: err && err.message, stack: err && err.stack }));
    return res.sendError(ErrorCodes.INTERNAL_SERVER_ERROR, 'users_identify_failed');
  }
});

// POST /users/profile
// Body: profile object for saving/updating user profile
// Requires authentication (Bearer token)
router.post('/profile', authMiddleware, async (req, res) => {
  try {
    const profile = req.body || {};
    if (!profile.phoneNumber) {
      return res.sendError(ErrorCodes.MISSING_REQUIRED_FIELD, 'missing_phone_number');
    }

    const db = req.app.get('db');
    if (!db) return res.sendError(ErrorCodes.INTERNAL_SERVER_ERROR, 'Database not configured');

    // Validate date of birth if provided
    const { computeIsAdult, validateDateOfBirth } = require('@niyati/commons').dateUtils;
    if (profile.dateOfBirth) {
      const dobCheck = validateDateOfBirth(profile.dateOfBirth);
      if (!dobCheck.valid) {
        const errorCode = dobCheck.code === 'PROFILE_003' ? ErrorCodes.PROFILE_UNDERAGE : ErrorCodes.PROFILE_INVALID_DOB;
        return res.sendError(errorCode, dobCheck.message);
      }
    }
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

    const profileResult = await db.query(upsertProfileSql, profileParams);
    if (!profileResult || !profileResult.rows || profileResult.rows.length === 0) {
      logger.error({ msg: 'users.profile.profile_upsert_returned_empty', phone: profile.phoneNumber });
      return res.sendError(ErrorCodes.INTERNAL_SERVER_ERROR, 'profile_upsert_failed');
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

    const creditsResult = await db.query(upsertCreditsSql, creditsParams);
    if (!creditsResult || !creditsResult.rows || creditsResult.rows.length === 0) {
      logger.error({ msg: 'users.profile.credits_upsert_returned_empty', phone: profile.phoneNumber, user_id: profileResult.rows[0].user_id });
      return res.sendError(ErrorCodes.INTERNAL_SERVER_ERROR, 'credits_upsert_failed');
    }

    // Also upsert into auth `users` table so /internal/users/lookup works.
    // Caddy routes /api/v1/users/profile here (bff-platform) rather than bff-auth,
    // so we must ensure the auth identity row exists in the same shared database.
    try {
      const upsertAuthUsersSql = `
        INSERT INTO users (phone_number, name, date_of_birth, time_of_birth, place_of_birth, lat, lon, timezone, consent_given, consent_date, credits, is_adult, last_login_location, last_login_lat, last_login_lon, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, CASE WHEN $9 THEN now() ELSE NULL END, $10, $11, $12, $13, $14, now(), now())
        ON CONFLICT (phone_number) DO UPDATE SET
          name = COALESCE(EXCLUDED.name, users.name),
          date_of_birth = COALESCE(EXCLUDED.date_of_birth, users.date_of_birth),
          time_of_birth = COALESCE(EXCLUDED.time_of_birth, users.time_of_birth),
          place_of_birth = COALESCE(EXCLUDED.place_of_birth, users.place_of_birth),
          lat = COALESCE(EXCLUDED.lat, users.lat),
          lon = COALESCE(EXCLUDED.lon, users.lon),
          timezone = COALESCE(EXCLUDED.timezone, users.timezone),
          consent_given = COALESCE(EXCLUDED.consent_given, users.consent_given),
          is_adult = COALESCE(EXCLUDED.is_adult, users.is_adult),
          last_login_location = COALESCE(EXCLUDED.last_login_location, users.last_login_location),
          last_login_lat = COALESCE(EXCLUDED.last_login_lat, users.last_login_lat),
          last_login_lon = COALESCE(EXCLUDED.last_login_lon, users.last_login_lon),
          updated_at = now()
        RETURNING id, phone_number, name
      `;
      const authParams = [
        profile.phoneNumber,
        profile.name || null,
        profile.dateOfBirth || null,
        profile.timeOfBirth || null,
        profile.placeOfBirth || null,
        profile.lat ? parseFloat(profile.lat) : null,
        profile.lon ? parseFloat(profile.lon) : null,
        profile.timezone || null,
        profile.consentGiven !== undefined ? !!profile.consentGiven : null,
        creditsResult.rows[0].credits ?? 10,
        profileResult.rows[0].is_adult ?? null,
        normalizedLastLoginLocation,
        profile.last_login_lat ? parseFloat(profile.last_login_lat) : null,
        profile.last_login_lon ? parseFloat(profile.last_login_lon) : null
      ];
      await db.query(upsertAuthUsersSql, authParams);
      logger.info({ msg: 'users.profile.auth_users_upserted', phone: profile.phoneNumber });
    } catch (authErr) {
      logger.warn({ msg: 'users.profile.auth_users_upsert_failed', phone: profile.phoneNumber, err: authErr && authErr.message });
    }

    logger.info({ msg: 'users.profile.success', phone: profile.phoneNumber, user_id: profileResult.rows[0].user_id });
    return res.sendSuccess({ user: Object.assign({}, profileResult.rows[0], creditsResult.rows[0]) });
  } catch (err) {
    logger.error(sanitize({ msg: 'users.profile.error', err: err && err.message, stack: err && err.stack }));
    return res.sendError(ErrorCodes.INTERNAL_SERVER_ERROR, 'Failed to save profile');
  }
});

// GET /users/lookup?phoneNumber=... or ?id=...
// Delegates to bff-auth for identity lookups (decoupled services)
router.get('/lookup', async (req, res) => {
  try {
    const phone = (req.query.phoneNumber || req.query.phone || '').trim();
    const id = (req.query.id || '').trim();
    if (!phone && !id) return res.sendError(ErrorCodes.MISSING_REQUIRED_FIELD, 'missing_lookup_identifier');

    // Delegate to bff-auth internal API (single responsibility: identity)
    const BFF_AUTH_BASE = process.env.BFF_AUTH_BASE
      || (process.env.BFF_AUTH_URL ? `${process.env.BFF_AUTH_URL.replace(/\/$/, '')}/api/v1` : null)
      || 'http://bff-auth:3001/api/v1';
    const svcToken = process.env.SERVICE_TOKEN || '';

    if (id) {
      const resp = await axios.get(`${BFF_AUTH_BASE.replace(/\/$/, '')}/internal/users/${encodeURIComponent(id)}`, { 
        headers: svcToken ? { 'X-Service-Token': svcToken } : {},
        timeout: 5000
      });
      if (!resp || !resp.data || !resp.data.status) return res.sendSuccess({ user: null });
      const user = resp.data.data ? resp.data.data.user : null;
      return res.sendSuccess({ user });
    }

    const resp = await axios.get(`${BFF_AUTH_BASE.replace(/\/$/, '')}/internal/users/lookup`, { 
      params: { phoneNumber: phone }, 
      headers: svcToken ? { 'X-Service-Token': svcToken } : {},
      timeout: 5000
    });
    if (!resp || !resp.data || !resp.data.status) return res.sendSuccess({ user: null });
    const user = resp.data.data ? resp.data.data.user : null;
    return res.sendSuccess({ user });
  } catch (err) {
    logger.error(sanitize({ msg: 'users.lookup.error', err: err && err.message }));
    return res.sendError(ErrorCodes.SERVICE_UNAVAILABLE, 'auth_service_unavailable');
  }
});

// Deadlock retry constants
const MAX_DEADLOCK_RETRIES = 3;
const DEADLOCK_BASE_DELAY_MS = 100;

// Helper: execute credit deduction with FOR UPDATE row-level locking and deadlock retry.
// Unifies both idempotent (reqId present) and non-idempotent paths.
async function executeDeduction(db, phone, amount, reqId, retryCount = 0) {
  try {
    await db.query('BEGIN');

    // Lock the user_credits row to prevent concurrent modifications
    const lockSql = `
      SELECT uc.user_id AS id, uc.credits, uc.total_paid_amount
      FROM user_credits uc
      JOIN user_profiles up ON uc.user_id = up.user_id
      WHERE regexp_replace(up.phone_number, '[^0-9]', '', 'g') = regexp_replace($1, '[^0-9]', '', 'g')
      LIMIT 1
      FOR UPDATE OF uc
    `;
    const lockResult = await db.query(lockSql, [phone]);

    if (!lockResult || !lockResult.rows || lockResult.rows.length === 0) {
      await db.query('ROLLBACK');
      return { type: 'not_found' };
    }

    const user = lockResult.rows[0];

    // Check sufficient credits BEFORE deducting
    if (user.credits < amount) {
      await db.query('ROLLBACK');
      return { type: 'insufficient_credits', currentBalance: user.credits, requiredCredits: amount };
    }

    // Insert pending charge transaction (idempotent flow only)
    if (reqId) {
      await db.query(
        `INSERT INTO charge_transactions (request_id, phone_number, amount, status, created_at) VALUES ($1, $2, $3, 'pending', now()) RETURNING id`,
        [reqId, phone, amount]
      );
    }

    // Deduct credits (exact subtraction — balance already verified)
    const updateSql = `
      UPDATE user_credits
      SET credits = credits - $2, updated_at = now()
      WHERE user_id = $1
      RETURNING user_id AS id, credits, total_paid_amount
    `;
    const result = await db.query(updateSql, [user.id, amount]);
    const updated = result.rows[0];

    // Finalize charge transaction (idempotent flow only)
    if (reqId) {
      await db.query(
        `UPDATE charge_transactions SET status = 'applied', credits_after = $2, updated_at = now() WHERE request_id = $1`,
        [reqId, updated.credits]
      );
    }

    await db.query('COMMIT');
    return { type: 'success', credits: updated.credits, totalPaidAmount: updated.total_paid_amount, userId: updated.id };

  } catch (err) {
    try { await db.query('ROLLBACK'); } catch (_) { /* ignore rollback error */ }

    // PostgreSQL deadlock detected (error code 40P01) — retry with exponential backoff
    if (err.code === '40P01' && retryCount < MAX_DEADLOCK_RETRIES) {
      const delay = DEADLOCK_BASE_DELAY_MS * Math.pow(2, retryCount);
      logger.warn({ msg: 'deduct_credits_deadlock_retry', retryCount: retryCount + 1, delay, phone, amount });
      await new Promise(resolve => setTimeout(resolve, delay));
      return executeDeduction(db, phone, amount, reqId, retryCount + 1);
    }

    throw err;
  }
}

// POST /users/deduct-credits
// Body: { phoneNumber: "+91-9899162012", amount: 2, queryType: "horoscope" | "premium" }
// Headers: x-idempotency-key (required for idempotent deductions)
// Deducts credits after a successful query response
// Requires authentication (Bearer token)
router.post('/deduct-credits', authMiddleware, async (req, res) => {
  try {
    const phone = (req.body.phoneNumber || '').trim();
    const amount = parseInt(req.body.amount, 10) || 2;
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

    // For idempotent flow, check if transaction was already processed
    if (incomingReqId) {
      const checkSql = `SELECT id, request_id, phone_number, amount, status, credits_after, created_at FROM charge_transactions WHERE request_id = $1 LIMIT 1`;
      const existing = await db.query(checkSql, [incomingReqId]);

      if (existing && existing.rows && existing.rows.length > 0) {
        const tx = existing.rows[0];
        logger.info({
          msg: 'deduct_credits_idempotent_hit',
          reqId: incomingReqId, phone, amount: tx.amount,
          status: tx.status, creditsAfter: tx.credits_after,
          originalTimestamp: tx.created_at
        });
        return res.sendSuccess({ credits: tx.credits_after, alreadyApplied: tx.status === 'applied' });
      }
    }

    // Execute deduction with FOR UPDATE locking and deadlock retry
    const result = await executeDeduction(db, phone, amount, incomingReqId || null);

    switch (result.type) {
      case 'not_found':
        logger.error({ msg: 'deduct_credits_user_not_found', phone, amount, reqId: incomingReqId });
        return res.sendError(ErrorCodes.NOT_FOUND, 'user_not_found');

      case 'insufficient_credits':
        logger.warn({ msg: 'deduct_credits_insufficient', phone, amount, currentBalance: result.currentBalance, reqId: incomingReqId });
        return res.sendError(ErrorCodes.INSUFFICIENT_CREDITS, 'insufficient_credits', {
          details: { currentBalance: result.currentBalance, requiredCredits: result.requiredCredits }
        });

      case 'success':
        logger.info({
          msg: incomingReqId ? 'deduct_credits_applied_idempotent' : 'credits_deducted_no_idempotency',
          reqId: incomingReqId, phone, amount, creditsAfter: result.credits, user_id: result.userId
        });
        return res.sendSuccess({ credits: result.credits, totalPaidAmount: result.totalPaidAmount });
    }
  } catch (err) {
    logger.error(sanitize({ msg: 'users.deduct-credits.error', err: err && err.message, stack: err && err.stack }));
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
    const parsedConfig = {
      credits_horoscope_cost: parseInt(appConfig.credits_horoscope_cost, 10) || 2,
      credits_premium_cost: parseInt(appConfig.credits_premium_cost, 10) || 4
    };

    const qType = await classify(question || '');
    const cost = parseInt(await getQueryCreditCost(question || '', parsedConfig), 10) || 0;

    // Query user_profiles + user_credits
    const userRes = await db.query(`
      SELECT uc.credits, uc.is_paid 
      FROM user_profiles up
      LEFT JOIN user_credits uc ON up.user_id = uc.user_id
      WHERE regexp_replace(up.phone_number, '[^0-9]', '', 'g') = regexp_replace($1, '[^0-9]', '', 'g') 
      LIMIT 1
    `, [phone]);
    const user = userRes && userRes.rows && userRes.rows[0];

    if (!user) {
      // New user: allow today's questions or casual (cost 0) queries
      return res.sendSuccess({ allowed: qType === 'today' || cost === 0, cost, qType });
    }

    const credits = typeof user.credits === 'number' ? user.credits : 0;

    if (cost > 0) {
      if (credits <= 0) {
        return res.sendSuccess({ allowed: false, reason: 'exhausted_credits', message: 'You have exhausted your credits for this month. Consider upgrading to paid subscription to continue asking questions.' });
      }

      if (credits < cost) {
        return res.sendSuccess({ allowed: false, reason: 'insufficient_credits', message: 'You have insufficient credits to ask this question. Upgrade to paid subscription to continue asking questions.' });
      }
    }

    if (credits <= 10 && qType === 'future') {
      return res.sendSuccess({ allowed: false, reason: 'low_credits_restricts_future', message: 'With low credits you may only ask questions about today.' });
    }

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
// Body: { phoneNumber, amount (INR), packageId? } — supports both flat amount and package-based top-up
// Adds credits after payment verification
// Requires authentication (Bearer token)
router.post('/add-credits', authMiddleware, async (req, res) => {
  try {
    const phone = (req.body.phoneNumber || '').trim();
    const packageId = (req.body.packageId || '').trim() || null;
    let amountINR = parseInt(req.body.amount, 10) || 0;

    if (!phone) {
      return res.sendError(ErrorCodes.MISSING_REQUIRED_FIELD, 'missing_phone_number');
    }

    const db = req.app.get('db');
    if (!db) return res.sendError(ErrorCodes.INTERNAL_SERVER_ERROR, 'Database not configured');

    const appConfig = await getAppConfig(db);
    let creditsToAdd = 0;

    // If a packageId is provided, resolve credits from the package definition
    if (packageId) {
      const packages = getTopupPackages(appConfig);
      const pkg = packages.find(p => p.id === packageId);
      if (!pkg) {
        return res.sendError(ErrorCodes.BAD_REQUEST, 'invalid_package');
      }
      creditsToAdd = pkg.credits;
      amountINR = amountINR || pkg.amountINR;
    } else {
      // Legacy flat-amount path
      const creditsPerTenINR = parseInt(appConfig.credits_per_10_inr, 10) || 1;
      creditsToAdd = Math.floor(amountINR / 10) * creditsPerTenINR;
    }

    if (creditsToAdd <= 0) {
      return res.sendError(ErrorCodes.BAD_REQUEST, 'invalid_amount');
    }

    const upiId = (req.body.upiId || '').trim() || null;
    const upiTxnId = (req.body.upiTxnId || '').trim() || null;

    const sql = `
      UPDATE user_credits 
      SET credits = credits + $2, 
          total_paid_amount = total_paid_amount + $3, 
          is_paid = TRUE, 
          last_payment_amount = $3, 
          last_payment_verified = TRUE, 
          upi_id = $4, 
          upi_txn_id = $5, 
          credit_expires_at = now() + interval '6 months',
          updated_at = now()
      WHERE user_id = (
        SELECT user_id FROM user_profiles WHERE regexp_replace(phone_number, '[^0-9]', '', 'g') = regexp_replace($1, '[^0-9]', '', 'g') LIMIT 1
      )
      RETURNING user_id, credits, total_paid_amount, is_paid, last_payment_amount, last_payment_verified, upi_id, upi_txn_id
    `;

    const result = await db.query(sql, [phone, creditsToAdd, amountINR, upiId, upiTxnId]);
    if (!result || !result.rows || result.rows.length === 0) {
      logger.error({ msg: 'users.add-credits.user_not_found', phone, amount: amountINR });
      return res.sendError(ErrorCodes.NOT_FOUND, 'user_not_found');
    }

    const user = result.rows[0];
    logger.info({ 
      msg: 'users.add-credits.success', 
      phone, 
      creditsAdded: creditsToAdd, 
      amountINR, 
      newTotal: user.credits,
      user_id: user.user_id
    });
    
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
    logger.error(sanitize({ msg: 'users.add-credits.error', err: err && err.message, stack: err && err.stack }));
    return res.sendError(ErrorCodes.INTERNAL_SERVER_ERROR, 'add_credits_failed');
  }
});

// GET /users/credits
// Query params: phoneNumber (required)
// Returns current credit balance for a user
router.get('/credits', authMiddleware, async (req, res) => {
  try {
    const phone = (req.query.phoneNumber || '').trim();
    if (!phone) {
      return res.sendError(ErrorCodes.MISSING_REQUIRED_FIELD, 'missing_phone_number');
    }

    const db = req.app.get('db');
    if (!db) return res.sendError(ErrorCodes.INTERNAL_SERVER_ERROR, 'Database not configured');

    const result = await db.query(`
      SELECT uc.credits, uc.is_paid, uc.total_paid_amount, uc.credits_last_reset
      FROM user_profiles up
      JOIN user_credits uc ON up.user_id = uc.user_id
      WHERE regexp_replace(up.phone_number, '[^0-9]', '', 'g') = regexp_replace($1, '[^0-9]', '', 'g')
      LIMIT 1
    `, [phone]);

    if (!result || !result.rows || result.rows.length === 0) {
      return res.sendError(ErrorCodes.NOT_FOUND, 'user_not_found');
    }

    const row = result.rows[0];
    return res.sendSuccess({
      credits: row.credits,
      isPaid: !!row.is_paid,
      totalPaidAmount: row.total_paid_amount || 0,
      lastReset: row.credits_last_reset || null
    });
  } catch (err) {
    logger.error(sanitize({ msg: 'users.credits.error', err: err && err.message }));
    return res.sendError(ErrorCodes.INTERNAL_SERVER_ERROR, 'credits_fetch_failed');
  }
});

// GET /users/transactions
// Query params: phoneNumber (required), limit (optional, default 50)
// Returns transaction history for a user
router.get('/transactions', authMiddleware, async (req, res) => {
  try {
    const phone = (req.query.phoneNumber || '').trim();
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 200);

    if (!phone) {
      return res.sendError(ErrorCodes.MISSING_REQUIRED_FIELD, 'missing_phone_number');
    }

    const db = req.app.get('db');
    if (!db) return res.sendError(ErrorCodes.INTERNAL_SERVER_ERROR, 'Database not configured');

    // Resolve user_id
    const userResult = await db.query(`
      SELECT user_id FROM user_profiles
      WHERE regexp_replace(phone_number, '[^0-9]', '', 'g') = regexp_replace($1, '[^0-9]', '', 'g')
      LIMIT 1
    `, [phone]);

    if (!userResult || !userResult.rows || userResult.rows.length === 0) {
      return res.sendError(ErrorCodes.NOT_FOUND, 'user_not_found');
    }

    const userId = userResult.rows[0].user_id;

    // Fetch charge_transactions for this user's phone_number
    const txnResult = await db.query(`
      SELECT id, request_id, credits_charged, query_type, status, metadata, created_at
      FROM charge_transactions
      WHERE phone_number = $1
         OR phone_number IN (
           SELECT phone_number FROM user_profiles WHERE user_id = $2
         )
      ORDER BY created_at DESC
      LIMIT $3
    `, [phone, userId, limit]);

    const transactions = (txnResult && txnResult.rows) || [];

    return res.sendSuccess({ transactions });
  } catch (err) {
    logger.error(sanitize({ msg: 'users.transactions.error', err: err && err.message }));
    return res.sendError(ErrorCodes.INTERNAL_SERVER_ERROR, 'transactions_fetch_failed');
  }
});

// GET /users/profile?phoneNumber=...
// Returns the full user profile
// Requires authentication (Bearer token)
router.get('/profile', authMiddleware, async (req, res) => {
  try {
    const phone = (req.query.phoneNumber || '').trim();
    if (!phone) {
      return res.sendError(ErrorCodes.MISSING_REQUIRED_FIELD, 'missing_phone_number');
    }

    const db = req.app.get('db');
    if (!db) return res.sendError(ErrorCodes.INTERNAL_SERVER_ERROR, 'Database not configured');

    const result = await db.query(`
      SELECT user_id, phone_number, name, date_of_birth, time_of_birth,
             place_of_birth, lat, lon, timezone, consent_given, is_adult, created_at
      FROM user_profiles
      WHERE regexp_replace(phone_number, '[^0-9]', '', 'g') = regexp_replace($1, '[^0-9]', '', 'g')
      LIMIT 1
    `, [phone]);

    if (!result || !result.rows || result.rows.length === 0) {
      return res.sendError(ErrorCodes.NOT_FOUND, 'user_not_found');
    }

    const row = result.rows[0];
    return res.sendSuccess({
      profile: {
        userId: row.user_id,
        phoneNumber: row.phone_number,
        name: row.name,
        dateOfBirth: row.date_of_birth,
        timeOfBirth: row.time_of_birth,
        placeOfBirth: row.place_of_birth,
        lat: row.lat,
        lon: row.lon,
        timezone: row.timezone,
        consentGiven: !!row.consent_given,
        isAdult: !!row.is_adult,
        createdAt: row.created_at
      }
    });
  } catch (err) {
    logger.error(sanitize({ msg: 'users.profile.get.error', err: err && err.message, stack: err && err.stack }));
    return res.sendError(ErrorCodes.INTERNAL_SERVER_ERROR, 'profile_fetch_failed');
  }
});

// DELETE /users/profile
// Body: { phoneNumber }
// Deletes user profile and all associated data (account deletion)
// Requires authentication (Bearer token)
router.delete('/profile', authMiddleware, async (req, res) => {
  try {
    const phone = (req.body && req.body.phoneNumber || '').trim();
    if (!phone) {
      return res.sendError(ErrorCodes.MISSING_REQUIRED_FIELD, 'missing_phone_number');
    }

    const db = req.app.get('db');
    if (!db) return res.sendError(ErrorCodes.INTERNAL_SERVER_ERROR, 'Database not configured');

    // Resolve user_id first
    const userResult = await db.query(`
      SELECT user_id FROM user_profiles
      WHERE regexp_replace(phone_number, '[^0-9]', '', 'g') = regexp_replace($1, '[^0-9]', '', 'g')
      LIMIT 1
    `, [phone]);

    if (!userResult || !userResult.rows || userResult.rows.length === 0) {
      return res.sendError(ErrorCodes.NOT_FOUND, 'user_not_found');
    }

    const userId = userResult.rows[0].user_id;

    // Delete related data in order (child tables first)
    await db.query('DELETE FROM charge_transactions WHERE phone_number = $1', [phone]);
    await db.query('DELETE FROM chat_messages WHERE user_id = $1', [userId]);
    await db.query('DELETE FROM payment_verifications WHERE user_id = $1', [userId]);
    await db.query('DELETE FROM user_credits WHERE user_id = $1', [userId]);
    await db.query('DELETE FROM user_profiles WHERE user_id = $1', [userId]);

    logger.info({ msg: 'users.profile.deleted', phone, userId });
    return res.sendSuccess({ deleted: true, userId });
  } catch (err) {
    logger.error(sanitize({ msg: 'users.profile.delete.error', err: err && err.message, stack: err && err.stack }));
    return res.sendError(ErrorCodes.INTERNAL_SERVER_ERROR, 'profile_delete_failed');
  }
});

// Default top-up packages (overridden by app_config keys topup_package_*)
const DEFAULT_TOPUP_PACKAGES = [
  { id: 'small',  credits: 10, amountINR: 100, label: '10 credits' },
  { id: 'medium', credits: 25, amountINR: 250, label: '25 credits' },
  { id: 'large',  credits: 50, amountINR: 500, label: '50 credits' }
];

function getTopupPackages(appConfig) {
  // Allow overriding via app_config: topup_package_small = "10,100", topup_package_medium = "25,250", etc.
  const packages = DEFAULT_TOPUP_PACKAGES.map(pkg => {
    const configVal = appConfig[`topup_package_${pkg.id}`];
    if (configVal && typeof configVal === 'string') {
      const [credits, amountINR] = configVal.split(',').map(v => parseInt(v.trim(), 10));
      if (credits > 0 && amountINR > 0) {
        return { ...pkg, credits, amountINR, label: `${credits} credits` };
      }
    }
    return pkg;
  });
  return packages;
}

// GET /users/config
// Returns configurable credits settings for the UI
router.get('/config', async (req, res) => {
  try {
    const db = req.app.get('db');
    if (!db) return res.sendError(ErrorCodes.INTERNAL_SERVER_ERROR, 'Database not configured');

    const appConfig = await getAppConfig(db);
    const topupPackages = getTopupPackages(appConfig);

    return res.sendSuccess({
      credits_monthly_free: parseInt(appConfig.credits_monthly_free, 10) || 10,
      credits_horoscope_cost: parseInt(appConfig.credits_horoscope_cost, 10) || 2,
      credits_premium_cost: parseInt(appConfig.credits_premium_cost, 10) || 4,
      credits_low_threshold: parseInt(appConfig.credits_low_threshold, 10) || 4,
      payment_amount_inr: parseInt(appConfig.payment_amount_inr, 10) || 500,
      topup_packages: topupPackages
    });
  } catch (err) {
    logger.error(sanitize({ msg: 'users.config.error', err: err && err.message }));
    return res.sendError(ErrorCodes.INTERNAL_SERVER_ERROR, 'config_fetch_failed');
  }
});

module.exports = router;
module.exports.executeDeduction = executeDeduction;
module.exports.getTopupPackages = getTopupPackages;
