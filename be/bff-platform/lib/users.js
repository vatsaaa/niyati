const express = require('express');
const router = express.Router();
const axios = require('axios');
const { logger, sanitize, ErrorCodes, config } = require('../commons');
const { classify } = require('./queryClassifier');

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
    if (!profile.phoneNumber || !profile.consentGiven) {
      return res.sendError(ErrorCodes.MISSING_REQUIRED_FIELD, 'phone_or_consent_missing');
    }

    const db = req.app.get('db');
    if (!db) return res.sendError(ErrorCodes.INTERNAL_SERVER_ERROR, 'Database not configured');

    const upsertSql = `
      INSERT INTO users (
        phone_number, name, date_of_birth, time_of_birth, place_of_birth,
        lat, lon, timezone, consent_given, consent_date,
        credits, total_paid_amount,
        last_login_location, last_login_lat, last_login_lon,
        is_paid, last_payment_amount, last_payment_verified, upi_id, upi_txn_id,
        created_at, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, now(), $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, now(), now())
      ON CONFLICT (phone_number) DO UPDATE SET
        name = COALESCE(EXCLUDED.name, users.name),
        date_of_birth = EXCLUDED.date_of_birth,
        time_of_birth = EXCLUDED.time_of_birth,
        place_of_birth = EXCLUDED.place_of_birth,
        lat = EXCLUDED.lat,
        lon = EXCLUDED.lon,
        timezone = EXCLUDED.timezone,
        consent_given = EXCLUDED.consent_given,
        last_login_location = COALESCE(EXCLUDED.last_login_location, users.last_login_location),
        last_login_lat = COALESCE(EXCLUDED.last_login_lat, users.last_login_lat),
        last_login_lon = COALESCE(EXCLUDED.last_login_lon, users.last_login_lon),
        updated_at = now()
      RETURNING id, phone_number, name, created_at, updated_at, credits, credits_last_reset, total_paid_amount, is_paid, last_payment_amount, last_payment_verified, upi_id, upi_txn_id, last_login_location, last_login_lat, last_login_lon
    `;

    // Ensure last_login_location is sent as a string (or null) to avoid numeric coercion
    const normalizedLastLoginLocation = (profile.last_login_location === undefined || profile.last_login_location === null) ? null : String(profile.last_login_location);

    const params = [
      profile.phoneNumber,
      profile.name || null,
      profile.dateOfBirth || null,
      profile.timeOfBirth || null,
      profile.placeOfBirth || null,
      profile.lat ? parseFloat(profile.lat) : null,
      profile.lon ? parseFloat(profile.lon) : null,
      profile.timezone || null,
      !!profile.consentGiven,
      10, // Default 10 credits for new users
      0,  // Default 0 total_paid_amount
      normalizedLastLoginLocation,
      profile.last_login_lat ? parseFloat(profile.last_login_lat) : (profile.last_login_lat === 0 ? 0 : null),
      profile.last_login_lon ? parseFloat(profile.last_login_lon) : (profile.last_login_lon === 0 ? 0 : null),
      false, // is_paid
      0,     // last_payment_amount
      false, // last_payment_verified
      profile.upiId || null,
      profile.upiTxnId || null
    ];
    // Log incoming user profile (USER)
    try { console.log('USER', `SYNC ${profile.phoneNumber} last_login_location=${profile.last_login_location || ''}`); } catch (e) {}

    const result = await db.query(upsertSql, params);
    const user = result.rows[0];

    // Server created/updated user record (NIYATI)
    try { console.log('NIYATI', `User synced ${user && user.phone_number}`); } catch (e) {}

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
    const sql = `SELECT id, phone_number, name, date_of_birth, time_of_birth, place_of_birth, lat, lon, timezone, consent_given, credits, credits_last_reset, total_paid_amount, is_paid, last_payment_amount, last_payment_verified, upi_id, upi_txn_id, last_login_location, last_login_lat, last_login_lon, created_at, updated_at FROM users WHERE regexp_replace(phone_number, '[^0-9]', '', 'g') = regexp_replace($1, '[^0-9]', '', 'g') LIMIT 1`;
    const result = await db.query(sql, [phone]);

    if (!result || !result.rows || result.rows.length === 0) {
      return res.sendSuccess({ returning: false, user: null });
    }

    const user = result.rows[0];
    
    // Load configurable credits settings
    const appConfig = await getAppConfig(db);
    const monthlyCredits = parseInt(appConfig.credits_monthly_free, 10) || 10;
    
    // Check if monthly credits need reset (reset on 1st of each month)
    let credits = user.credits ?? monthlyCredits;
    const lastReset = user.credits_last_reset ? new Date(user.credits_last_reset) : new Date(0);
    const now = new Date();
    if (lastReset.getMonth() !== now.getMonth() || lastReset.getFullYear() !== now.getFullYear()) {
      // Reset credits to monthly allowance
      credits = monthlyCredits;
      // Update in DB
      try {
        await db.query('UPDATE users SET credits = $1, credits_last_reset = now() WHERE id = $2', [monthlyCredits, user.id]);
      } catch (e) { /* ignore */ }
    }
    
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
        credits: credits,
        total_paid_amount: user.total_paid_amount || 0,
        is_paid: !!user.is_paid,
        last_payment_amount: user.last_payment_amount || 0,
        last_payment_verified: !!user.last_payment_verified,
        upi_id: user.upi_id || null,
        upi_txn_id: user.upi_txn_id || null,
        last_login_location: user.last_login_location,
        last_login_lat: user.last_login_lat,
        last_login_lon: user.last_login_lon
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

    const upsertSql = `
      INSERT INTO users (
        phone_number, name, date_of_birth, time_of_birth, place_of_birth,
        lat, lon, timezone, consent_given, consent_date,
        credits, total_paid_amount,
        last_login_location, last_login_lat, last_login_lon,
        is_paid, last_payment_amount, last_payment_verified, upi_id, upi_txn_id,
        created_at, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, CASE WHEN $9 THEN now() ELSE NULL END, $10, $11, $12, $13, $14, $15, $16, $17, $18, now(), now())
      ON CONFLICT (phone_number) DO UPDATE SET
        name = COALESCE(EXCLUDED.name, users.name),
        date_of_birth = COALESCE(EXCLUDED.date_of_birth, users.date_of_birth),
        time_of_birth = COALESCE(EXCLUDED.time_of_birth, users.time_of_birth),
        place_of_birth = COALESCE(EXCLUDED.place_of_birth, users.place_of_birth),
        lat = COALESCE(EXCLUDED.lat, users.lat),
        lon = COALESCE(EXCLUDED.lon, users.lon),
        timezone = COALESCE(EXCLUDED.timezone, users.timezone),
        consent_given = COALESCE(EXCLUDED.consent_given, users.consent_given),
        last_login_location = COALESCE(EXCLUDED.last_login_location, users.last_login_location),
        last_login_lat = COALESCE(EXCLUDED.last_login_lat, users.last_login_lat),
        last_login_lon = COALESCE(EXCLUDED.last_login_lon, users.last_login_lon),
        updated_at = now()
      RETURNING id, phone_number, name, date_of_birth, time_of_birth, place_of_birth, lat, lon, timezone, consent_given, credits, credits_last_reset, total_paid_amount, is_paid, last_payment_amount, last_payment_verified, upi_id, upi_txn_id, last_login_location, last_login_lat, last_login_lon
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
      10, // Default 10 credits
      0,  // Default 0 total_paid_amount
      profile.last_login_location || null,
      profile.last_login_lat ? parseFloat(profile.last_login_lat) : (profile.last_login_lat === 0 ? 0 : null),
      profile.last_login_lon ? parseFloat(profile.last_login_lon) : (profile.last_login_lon === 0 ? 0 : null),
      false, // is_paid
      0,     // last_payment_amount
      false, // last_payment_verified
      profile.upiId || null,
      profile.upiTxnId || null
    ];

    // Log incoming profile update (USER)
    try { console.log('USER', `PROFILE_UPDATE ${profile.phoneNumber} last_login_location=${profile.last_login_location || ''}`); } catch (e) {}

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
      credits: user.credits,
      total_paid_amount: user.total_paid_amount,
      is_paid: !!user.is_paid,
      last_payment_amount: user.last_payment_amount || 0,
      last_payment_verified: !!user.last_payment_verified,
      upi_id: user.upi_id || null,
      upi_txn_id: user.upi_txn_id || null,
      last_login_location: user.last_login_location,
      last_login_lat: user.last_login_lat,
      last_login_lon: user.last_login_lon
    };

    // Server saved profile (NIYATI)
    try { console.log('NIYATI', `Profile saved for ${outUser.phone_number}`); } catch (e) {}
    return res.sendSuccess({ user: outUser });
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
      sql = `SELECT id, phone_number, name, date_of_birth, time_of_birth, place_of_birth, lat, lon, timezone, consent_given, credits, credits_last_reset, total_paid_amount, last_login_location, last_login_lat, last_login_lon, created_at, updated_at FROM users WHERE id = $1 LIMIT 1`;
      params = [id];
    } else {
      // Normalize phone by comparing only digits to allow flexible formatting ( +91-999... vs +91999... )
      sql = `SELECT id, phone_number, name, date_of_birth, time_of_birth, place_of_birth, lat, lon, timezone, consent_given, credits, credits_last_reset, total_paid_amount, last_login_location, last_login_lat, last_login_lon, created_at, updated_at FROM users WHERE regexp_replace(phone_number, '[^0-9]', '', 'g') = regexp_replace($1, '[^0-9]', '', 'g') LIMIT 1`;
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

// POST /users/deduct-credits
// Body: { phoneNumber: "+91-9899162012", amount: 2, queryType: "horoscope" | "premium" }
// Deducts credits after a successful query response
router.post('/deduct-credits', async (req, res) => {
  try {
    const phone = (req.body.phoneNumber || '').trim();
    const amount = parseInt(req.body.amount, 10) || 2;
    
    if (!phone) {
      return res.sendError(ErrorCodes.MISSING_REQUIRED_FIELD, 'missing_phone_number');
    }
    
    const db = req.app.get('db');
    if (!db) return res.sendError(ErrorCodes.INTERNAL_SERVER_ERROR, 'Database not configured');
    
    // Deduct credits (don't go below 0)
    const sql = `
      UPDATE users 
      SET credits = GREATEST(credits - $2, 0), updated_at = now()
      WHERE regexp_replace(phone_number, '[^0-9]', '', 'g') = regexp_replace($1, '[^0-9]', '', 'g')
      RETURNING id, credits, total_paid_amount
    `;
    
    const result = await db.query(sql, [phone, amount]);
    if (!result || !result.rows || result.rows.length === 0) {
      return res.sendError(ErrorCodes.NOT_FOUND, 'user_not_found');
    }
    
    const user = result.rows[0];
    return res.sendSuccess({ 
      credits: user.credits,
      totalPaidAmount: user.total_paid_amount
    });
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
    const costToday = parseInt(appConfig.credits_horoscope_cost, 10) || 2;
    const costFuture = parseInt(appConfig.credits_premium_cost, 10) || 4;

    const qType = classify(question || ''); // 'today' | 'future'
    const cost = qType === 'future' ? costFuture : costToday;

    const userRes = await db.query(`SELECT credits, is_paid FROM users WHERE regexp_replace(phone_number, '[^0-9]', '', 'g') = regexp_replace($1, '[^0-9]', '', 'g') LIMIT 1`, [phone]);
    const user = userRes && userRes.rows && userRes.rows[0];

    if (!user) {
      // New user: allow today's (default cheaper) but no deduction yet
      return res.sendSuccess({ allowed: qType === 'today', cost, qType });
    }

    const credits = typeof user.credits === 'number' ? user.credits : 0;

    if (credits <= 0) {
      return res.sendSuccess({ allowed: false, reason: 'exhausted_credits', message: 'You have exhausted your credits for this month. Consider upgrading to paid subscription to continue asking questions.' });
    }

    if (credits < cost) {
      return res.sendSuccess({ allowed: false, reason: 'insufficient_credits', message: 'You have insufficient credits to ask this question. Upgrade to paid subscription to continue asking questions.' });
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

