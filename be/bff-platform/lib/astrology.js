const express = require('express');
const router = express.Router();
const astrologyService = require('../services/astrologyService');
const axios = require('axios');
const { logger, sanitize, reqIdFromReq, config, ErrorCodes } = require('../../commons');

// POST /api/astrology/compute
// Accepts { profile: { name, dob, timeOfBirth, placeOfBirth: { city, countryCode, lat, lng } } }
// Returns a normalized astrology response from the configured provider (or a mock fallback).
router.post('/compute', async (req, res) => {
  const profile = req.body.profile || {};
  if (!profile.dob || !profile.placeOfBirth) {
    return res.sendError(ErrorCodes.MISSING_REQUIRED_FIELD, 'Missing profile fields');
  }
  const incomingReqId = req._niyati_reqId || reqIdFromReq(req) || (req.headers && req.headers['x-request-id']);
  try {
    const result = await astrologyService.compute(profile);
    try {
      const previewSource = (result && result.source) || undefined;
      let bodyPreview = '';
      try {
        const s = JSON.stringify((result && result.data) || result);
        if (s) bodyPreview = s.length > 200 ? s.slice(0, 200) + '...' : s;
      } catch (e) {}
      logger.info(sanitize({ msg: 'astrology.route.compute_result', reqId: incomingReqId, source: previewSource, bodyPreview }));
    } catch (e) {}
    return res.sendSuccess(result);
  } catch (err) {
    try { logger.error(sanitize({ msg: 'astrology.route.compute_result', reqId: incomingReqId, error: err && (err.message || err.original) })); } catch (e) { logger.error(sanitize({ msg: 'Astrology compute error', error: err && err.message })); }
    return res.sendError(ErrorCodes.PROVIDER_ERROR, 'Provider error');
  }
});

// POST /api/astrology/geo-details
// body: { q: 'Pune, India' } or { lat: 18.5, lon: 73.8 } or placeOfBirth object
router.post('/geo-details', async (req, res) => {
  const body = req.body || {};
  let query = null;
  if (typeof body === 'string') query = { location: body };
  else if (body.location) query = { location: body.location };
  else if (body.q || body.place) query = { q: body.q || body.place };
  else if (body.placeOfBirth) query = body.placeOfBirth;
  else if (body.lat || body.lon || body.latitude || body.longitude) query = { lat: body.lat || body.latitude, lon: body.lon || body.longitude };

  if (!query || (typeof query === 'object' && !query.q && !query.lat && !query.lon && !query.location && !query.placeOfBirth)) {
    return res.sendError(ErrorCodes.MISSING_REQUIRED_FIELD, 'Missing query');
  }

  const incomingReqId = req._niyati_reqId || reqIdFromReq(req) || (req.headers && req.headers['x-request-id']);
  try {
    const result = await astrologyService.geoDetails(query);
    try {
      const previewSource = (result && result.source) || undefined;
      let bodyPreview = '';
      try {
        const s = JSON.stringify((result && result.data) || result);
        if (s) bodyPreview = s.length > 200 ? s.slice(0, 200) + '...' : s;
      } catch (e) {}
      logger.info(sanitize({ msg: 'astrology.route.geo_details_result', reqId: incomingReqId, source: previewSource, bodyPreview }));
    } catch (e) {}
    return res.sendSuccess(result);
  } catch (err) {
    try { logger.error(sanitize({ msg: 'astrology.route.geo_details_result', reqId: incomingReqId, error: err && (err.message || err.original) })); } catch (e) { logger.error(sanitize({ msg: 'Astrology geo-details error', error: err && err.message })); }
    return res.sendError(ErrorCodes.PROVIDER_ERROR, 'Provider error');
  }
});

// POST /api/astrology/planets
// Accepts the planets payload shown in FreeAstrologyAPI docs, or a profile object to build it.
router.post('/planets', async (req, res) => {
  const body = req.body || {};
  const payload = body.payload || body;
  if (!payload) return res.sendError(ErrorCodes.MISSING_REQUIRED_FIELD, 'Missing payload');
  try {
    // Propagate incoming request id into service calls for downstream correlation
    try { payload._reqId = req._niyati_reqId || reqIdFromReq(req) || req.headers['x-request-id']; } catch (e) {}
    const data = await astrologyService.planets(payload);
    try {
      const incomingReqId = req._niyati_reqId || reqIdFromReq(req) || (req.headers && req.headers['x-request-id']);
      const previewSource = config.astrology.baseUrl;
      let bodyPreview = '';
      try {
        const s = JSON.stringify(data);
        if (s) bodyPreview = s.length > 200 ? s.slice(0, 200) + '...' : s;
      } catch (e) {}
      logger.info(sanitize({ msg: 'astrology.route.planets_result', reqId: incomingReqId, source: previewSource, bodyPreview }));
    } catch (e) {}
    return res.sendSuccess({ source: config.astrology.baseUrl, data });
  } catch (err) {
    try { const incomingReqId = req._niyati_reqId || reqIdFromReq(req) || (req.headers && req.headers['x-request-id']); logger.error(sanitize({ msg: 'astrology.route.planets_result', reqId: incomingReqId, error: err && (err.message || err.original) })); } catch (e) { logger.error(sanitize({ msg: 'Astrology planets error', error: err && (err.message || err.original) })); }
    return res.sendError(ErrorCodes.PROVIDER_ERROR, 'Provider error');
  }
});

// POST /api/astrology/navamsa
// body: payload or profile
router.post('/navamsa', async (req, res) => {
  const body = req.body || {};
  const payload = body.payload || body;
  if (!payload) return res.sendError(ErrorCodes.MISSING_REQUIRED_FIELD, 'Missing payload');
  const incomingReqId = req._niyati_reqId || reqIdFromReq(req) || (req.headers && req.headers['x-request-id']);
  try {
    const result = await astrologyService.navamsa(payload);
    try {
      const previewSource = (result && result.source) || undefined;
      let bodyPreview = '';
      try {
        const s = JSON.stringify((result && result.data) || result);
        if (s) bodyPreview = s.length > 200 ? s.slice(0, 200) + '...' : s;
      } catch (e) {}
      logger.info(sanitize({ msg: 'astrology.route.navamsa_result', reqId: incomingReqId, source: previewSource, bodyPreview }));
    } catch (e) {}
    return res.sendSuccess(result);
  } catch (err) {
    try { logger.error(sanitize({ msg: 'astrology.route.navamsa_result', reqId: incomingReqId, error: err && (err.message || err.original) })); } catch (e) { logger.error(sanitize({ msg: 'Astrology navamsa error', error: err && (err.message || err.original) })); }
    return res.sendError(ErrorCodes.PROVIDER_ERROR, 'Provider error');
  }
});

// POST /api/astrology/divisional
// body: { divisional: 2..60, payload: { ... } }
router.post('/divisional', async (req, res) => {
  const body = req.body || {};
  const n = parseInt(body.divisional || body.n || body.d || 0, 10);
  if (!n || n < 2 || n > 60) return res.sendError(ErrorCodes.INVALID_INPUT, 'Invalid divisional');
  const payload = body.payload || body;
  const incomingReqId = req._niyati_reqId || reqIdFromReq(req) || (req.headers && req.headers['x-request-id']);
  try {
    const result = await astrologyService.divisional(n, payload);
    try {
      const previewSource = (result && result.source) || undefined;
      let bodyPreview = '';
      try {
        const s = JSON.stringify((result && result.data) || result);
        if (s) bodyPreview = s.length > 200 ? s.slice(0, 200) + '...' : s;
      } catch (e) {}
      logger.info(sanitize({ msg: 'astrology.route.divisional_result', reqId: incomingReqId, source: previewSource, bodyPreview }));
    } catch (e) {}
    return res.sendSuccess(result);
  } catch (err) {
    try { logger.error(sanitize({ msg: 'astrology.route.divisional_result', reqId: incomingReqId, error: err && (err.message || err.original) })); } catch (e) { logger.error(sanitize({ msg: 'Astrology divisional error', error: err && (err.message || err.original) })); }
    if (err && err.code === 'invalid_divisional') return res.sendError(ErrorCodes.INVALID_INPUT, 'Invalid divisional');
    return res.sendError(ErrorCodes.PROVIDER_ERROR, 'Provider error');
  }
});

// POST /api/astrology/horoscope-svg
// body: payload or profile
router.post('/horoscope-svg', async (req, res) => {
  const body = req.body || {};
  const payload = body.payload || body;
  if (!payload) return res.sendError(ErrorCodes.MISSING_REQUIRED_FIELD, 'Missing payload');
  try {
    const incomingReqId = req._niyati_reqId || reqIdFromReq(req) || (req.headers && req.headers['x-request-id']);
    logger.info(sanitize({ msg: 'astrology.route.horoscope_incoming', reqId: incomingReqId, path: req.path, body: req.body }));
  } catch (e) {
    // best-effort logging, don't fail the request
  }
  try {
    try { payload._reqId = req._niyati_reqId || reqIdFromReq(req) || req.headers['x-request-id']; } catch (e) {}
    const result = await astrologyService.horoscopeSvg(payload);
    // Emit a clear success log so end-to-end requests are easy to trace in logs
    try {
      const previewSource = (result && result.source) || (result && result.data && result.data.source) || undefined;
      let bodyPreview = '';
      try {
        const s = JSON.stringify(result && result.data);
        if (s) bodyPreview = s.length > 200 ? s.slice(0, 200) + '...' : s;
      } catch (e) {
        // ignore preview failures
      }
      logger.info(sanitize({ msg: 'astrology.route.horoscope_result', reqId: incomingReqId, source: previewSource, bodyPreview }));
    } catch (e) {
      // best-effort logging shouldn't break response
    }
    return res.sendSuccess(result);
  } catch (err) {
    // Log failure with the same route tag for easy searching; include reqId and error details
    try {
      logger.error(sanitize({ msg: 'astrology.route.horoscope_result', reqId: incomingReqId, error: err && (err.message || err.original) }));
    } catch (e) {
      logger.error(sanitize({ msg: 'Astrology horoscope-svg error', error: err && (err.message || err.original) }));
    }
    return res.sendError(ErrorCodes.PROVIDER_ERROR, 'Provider error');
  }
});

// Temporary debug endpoint: POST /api/astrology/probe
// Body: { payload?: object, paths?: string[] }
// Tries a list of candidate paths against ASTRO_API_URL base and returns provider responses.
// DISABLED in production for security
router.post('/probe', async (req, res) => {
  // Disable based on feature flag
  if (!config.features.probeEndpoint) {
    return res.sendError(ErrorCodes.NOT_FOUND, 'Probe endpoint not enabled');
  }

  const base = config.astrology.baseUrl.replace(/\/$/, '');
  const key = process.env.ASTRO_API_KEY;
  
  // Use proper payload format based on the working endpoints
  const defaultPayload = {
    year: 1990, month: 11, date: 23,
    hours: 7, minutes: 30, seconds: 0,
    latitude: 18.5204, longitude: 73.8567, timezone: 5.5,
    settings: { observation_point: 'topocentric', ayanamsha: 'lahiri' }
  };
  const payload = req.body.payload || defaultPayload;
  
  // Test actual working endpoints instead of generic paths
  const candidates = req.body.paths && Array.isArray(req.body.paths) && req.body.paths.length 
    ? req.body.paths 
    : ['/planets/extended', '/navamsa-chart-info', '/d10-chart-info', '/horoscope-chart-svg-code'];
  
  // Use proper authentication headers like the working services
  const headers = { 'Content-Type': 'application/json' };
  if (key) headers['x-api-key'] = key;
  if (process.env.ASTRO_API_TOKEN) headers['Authorization'] = `Bearer ${process.env.ASTRO_API_TOKEN}`;

  const results = [];
  for (const p of candidates) {
    const url = (p === '/' ? base + '/' : base + (p.startsWith('/') ? p : `/${p}`));
    
    try {
      const r = await axios.post(url, payload, { headers, timeout: 8000, validateStatus: null });
      results.push({ path: p, url, status: r.status, data: r.data });
    } catch (err) {
      results.push({ path: p, url, error: err.message, response: err.response && err.response.data });
    }
  }
  return res.sendSuccess({ tried: candidates, results });
});

module.exports = router;
