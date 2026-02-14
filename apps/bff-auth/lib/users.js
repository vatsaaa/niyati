const express = require('express');
function _responses() { return require('@niyati/commons/lib/responses'); }
function RC(codeName) { const r = _responses(); return r && r.ErrorCodes && r.ErrorCodes[codeName] ? r.ErrorCodes[codeName] : codeName; }

const router = express.Router();
const axios = require('axios');

// JWT issuance for phone-based identification
const { auth: commonAuth } = require('@niyati/commons');
const { createAccessToken } = commonAuth;

// Helper to validate phone number (basic)
function isValidPhone(phone) {
    // Allow +[1-9] followed by digits, spaces, hyphens
    // Min 8 digits
    if (!phone || typeof phone !== 'string') return false;
    const stripped = phone.replace(/[^0-9]/g, '');
    return stripped.length >= 8 && stripped.length <= 15;
}

// POST /users/profile
// Body: { phoneNumber, dateOfBirth, timeOfBirth, placeOfBirth, lat, lon, timezone, consentGiven }
router.post('/profile', async (req, res) => {
    try {
        const {
            phoneNumber,
            name,
            dateOfBirth,
            timeOfBirth,
            placeOfBirth,
            lat,
            lon,
            timezone,
            consentGiven
        } = req.body || {};

        // Mandatory
        if (!isValidPhone(phoneNumber)) {
            return res.sendError(RC('VALIDATION_ERROR'), 'Invalid phone number');
        }

        // Forward to bff-platform users sync endpoint only for first-time users.
        const BFF_PLATFORM_BASE = process.env.BFF_PLATFORM_BASE || 'http://bff-platform:3000/api/v1';
        const SERVICE_TOKEN = process.env.SERVICE_TOKEN || '';

        try {
            // Log incoming profile creation/update (USER)
            try { console.log('USER', `PROFILE ${phoneNumber} last_login_location=${req.body.last_login_location || ''}`); } catch (e) { }
            // Check if user already exists on platform
            const lookupResp = await axios.get(`${BFF_PLATFORM_BASE.replace(/\/$/, '')}/users/lookup`, {
                params: { phoneNumber },
                headers: SERVICE_TOKEN ? { 'X-Service-Token': SERVICE_TOKEN } : {}
            });

            if (lookupResp && lookupResp.data && lookupResp.data.status === 'ok' && lookupResp.data.data && lookupResp.data.data.user) {
                // Returning user - allow lightweight updates (e.g., last_login_location)
                const existingUser = lookupResp.data.data.user;

                // If the client provided any updatable fields, forward them to platform sync/update
                const normalizedLastLoginLocation = (req.body.last_login_location === undefined || req.body.last_login_location === null) ? undefined : String(req.body.last_login_location);
                const updatePayload = {};
                if (typeof name !== 'undefined' && name) updatePayload.name = name;
                if (typeof dateOfBirth !== 'undefined' && dateOfBirth) updatePayload.dateOfBirth = dateOfBirth;
                if (typeof timeOfBirth !== 'undefined' && timeOfBirth) updatePayload.timeOfBirth = timeOfBirth;
                if (typeof placeOfBirth !== 'undefined' && placeOfBirth) updatePayload.placeOfBirth = placeOfBirth;
                if (typeof normalizedLastLoginLocation !== 'undefined') updatePayload.last_login_location = normalizedLastLoginLocation;
                if (typeof lat !== 'undefined') updatePayload.lat = lat ? parseFloat(lat) : null;
                if (typeof lon !== 'undefined') updatePayload.lon = lon ? parseFloat(lon) : null;
                if (typeof timezone !== 'undefined') updatePayload.timezone = timezone || null;
                // Only include consentGiven if explicitly provided by client - otherwise preserve existing
                if (typeof consentGiven !== 'undefined') updatePayload.consentGiven = !!consentGiven;

                if (Object.keys(updatePayload).length > 0) {
                    try {
                        await axios.post(`${BFF_PLATFORM_BASE.replace(/\/$/, '')}/users/sync`, Object.assign({ phoneNumber }, updatePayload), {
                            headers: SERVICE_TOKEN ? { 'X-Service-Token': SERVICE_TOKEN } : {}
                        });
                        // Re-fetch or merge existingUser is fine for now; we'll return existing data.
                    } catch (err) {
                        console.warn('Failed to forward returning-user update to platform:', err && err.message ? err.message : err);
                    }
                }

                return res.sendSuccess({ user: existingUser, created: false });
            }

            // New user - require explicit consent and persist via platform sync
            if (!consentGiven) {
                return res.sendError(RC('VALIDATION_ERROR'), 'User consent is required');
            }
            // Normalize last_login_location to string to avoid accidental numeric coercion
            const normalizedLastLoginLocation = (req.body.last_login_location === undefined || req.body.last_login_location === null) ? null : String(req.body.last_login_location);

            const resp = await axios.post(`${BFF_PLATFORM_BASE.replace(/\/$/, '')}/users/sync`, {
                phoneNumber,
                name: name || null,
                dateOfBirth: dateOfBirth || null,
                timeOfBirth: timeOfBirth || null,
                placeOfBirth: placeOfBirth || null,
                lat: lat ? parseFloat(lat) : null,
                lon: lon ? parseFloat(lon) : null,
                timezone: timezone || null,
                consentGiven: !!consentGiven,
                isPaid: !!req.body.isPaid,
                last_login_location: normalizedLastLoginLocation
            }, {
                headers: SERVICE_TOKEN ? { 'X-Service-Token': SERVICE_TOKEN } : {}
            });

            // Server-side log indicating we forwarded profile to platform (NIYATI)
            try { console.log('NIYATI', `Forwarded profile for ${phoneNumber} to bff-platform`); } catch (e) { }

            // Create (or upsert) auth identity in local users table so /internal/users/lookup works
            const db = req.app.get('db');
            if (db) {
                try {
                    const upsertAuthSql = `
                        INSERT INTO users (phone_number, name, date_of_birth, time_of_birth, place_of_birth, lat, lon, timezone, consent_given, consent_date, created_at, updated_at)
                        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, CASE WHEN $9 THEN now() ELSE NULL END, now(), now())
                        ON CONFLICT (phone_number) DO UPDATE SET
                            name = COALESCE(EXCLUDED.name, users.name),
                            date_of_birth = COALESCE(EXCLUDED.date_of_birth, users.date_of_birth),
                            time_of_birth = COALESCE(EXCLUDED.time_of_birth, users.time_of_birth),
                            place_of_birth = COALESCE(EXCLUDED.place_of_birth, users.place_of_birth),
                            lat = COALESCE(EXCLUDED.lat, users.lat),
                            lon = COALESCE(EXCLUDED.lon, users.lon),
                            timezone = COALESCE(EXCLUDED.timezone, users.timezone),
                            consent_given = COALESCE(EXCLUDED.consent_given, users.consent_given),
                            updated_at = now()
                        RETURNING id, phone_number, name
                    `;
                    await db.query(upsertAuthSql, [
                        phoneNumber,
                        name || null,
                        dateOfBirth || null,
                        timeOfBirth || null,
                        placeOfBirth || null,
                        lat ? parseFloat(lat) : null,
                        lon ? parseFloat(lon) : null,
                        timezone || null,
                        !!consentGiven
                    ]);
                } catch (dbErr) {
                    console.warn('Failed to upsert auth users row:', dbErr && dbErr.message ? dbErr.message : dbErr);
                }
            }

            // Expect standardized response from bff-platform
            if (resp && resp.data && resp.data.status === 'ok') {
                return res.sendSuccess({ ...resp.data.data, created: true });
            }
            // Map provider error
            return res.sendError(RC('PROVIDER_ERROR'), 'sync_failed');
        } catch (err) {
            console.error('Profile sync error (to bff-platform):', err && err.message ? err.message : err);
            return res.sendError(RC('PROVIDER_ERROR'), 'sync_failed');
        }

    } catch (err) {
        console.error('Profile upsert error:', err);
        return res.sendError(RC('INTERNAL_SERVER_ERROR'), 'Failed to save profile');
    }
});

// POST /users/identify
// Body: { phoneNumber }
router.post('/identify', async (req, res) => {
    try {
        const { phoneNumber } = req.body || {};
        if (!isValidPhone(phoneNumber)) {
            return res.sendError(RC('VALIDATION_ERROR'), 'Invalid phone number');
        }

        const BFF_PLATFORM_BASE = process.env.BFF_PLATFORM_BASE || 'http://bff-platform:3000/api/v1';
        const SERVICE_TOKEN = process.env.SERVICE_TOKEN || '';

        try {
            const resp = await axios.get(`${BFF_PLATFORM_BASE.replace(/\/$/, '')}/users/lookup`, {
                params: { phoneNumber },
                headers: SERVICE_TOKEN ? { 'X-Service-Token': SERVICE_TOKEN } : {}
            });

            if (resp && resp.data && resp.data.status === 'ok') {
                const user = resp.data.data ? resp.data.data.user : null;
                if (user) {
                    // Issue access token for authenticated session
                    const access_token = createAccessToken({ sub: user.id || user.user_id, phone: phoneNumber });
                    return res.sendSuccess({ returning: true, user, access_token });
                }
                // New user: issue token keyed on phone (no DB record yet)
                const access_token = createAccessToken({ sub: phoneNumber, phone: phoneNumber });
                return res.sendSuccess({ returning: false, access_token });
            }

            return res.sendError(RC('PROVIDER_ERROR'), 'lookup_failed');
        } catch (err) {
            console.error('User lookup error (to bff-platform):', err && err.message ? err.message : err);
            return res.sendError(RC('PROVIDER_ERROR'), 'lookup_failed');
        }
    } catch (err) {
        console.error('Identify error:', err);
        return res.sendError(RC('INTERNAL_SERVER_ERROR'), 'identify_failed');
    }
});

module.exports = router;
