const express = require('express');
function _responses() { return require('../commons/lib/responses'); }
function RC(codeName) { const r = _responses(); return r && r.ErrorCodes && r.ErrorCodes[codeName] ? r.ErrorCodes[codeName] : codeName; }

const router = express.Router();
const axios = require('axios');

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

        if (!consentGiven) {
            return res.sendError(RC('VALIDATION_ERROR'), 'User consent is required');
        }

        // Forward to bff-platform users sync endpoint only for first-time users.
        const BFF_PLATFORM_BASE = process.env.BFF_PLATFORM_BASE || 'http://bff-platform:3000/api/v1';
        const SERVICE_TOKEN = process.env.SERVICE_TOKEN || '';

        try {
            // Check if user already exists on platform
            const lookupResp = await axios.get(`${BFF_PLATFORM_BASE.replace(/\/$/, '')}/users/lookup`, {
                params: { phoneNumber },
                headers: SERVICE_TOKEN ? { 'X-Service-Token': SERVICE_TOKEN } : {}
            });

            if (lookupResp && lookupResp.data && lookupResp.data.status === 'ok' && lookupResp.data.data && lookupResp.data.data.user) {
                // Returning user - do not persist again. Return existing data to client.
                return res.sendSuccess({ user: lookupResp.data.data.user, created: false });
            }

            // New user - persist via platform sync
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
                last_login_location: req.body.last_login_location || null
            }, {
                headers: SERVICE_TOKEN ? { 'X-Service-Token': SERVICE_TOKEN } : {}
            });

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
                    return res.sendSuccess({ returning: true, user });
                }
                return res.sendSuccess({ returning: false });
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
