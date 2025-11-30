const express = require('express');
const router = express.Router();
const geocodeService = require('../services/geocodeService');
const { logger, sanitize, reqIdFromReq } = require('../lib/logger');

// POST /api/geocode  (alias for search)
// body: { q: 'Pune, Maharashtra' }
router.post('/', async (req, res) => {
  const q = (req.body.q || req.body.place || '').toString().trim();
  if (!q) return res.status(400).json({ status: 'error', reason: 'missing_query' });
  try {
    const reqId = reqIdFromReq(req) || req.headers['x-request-id'];
    logger.debug('geocode.route.search_incoming', sanitize({ reqId, q }));
    const result = await geocodeService.search(q);
    logger.debug('geocode.route.search_result', sanitize({ reqId, q, result }));
    return res.json(result);
  } catch (err) {
    logger.error('geocode.route.error', sanitize({ error: err && (err.message || err) }));
    return res.status(500).json({ status: 'error', reason: 'server_error' });
  }
});

// POST /api/geocode/search
router.post('/search', async (req, res) => {
  const q = (req.body.q || req.body.place || '').toString().trim();
  if (!q) return res.status(400).json({ status: 'error', reason: 'missing_query' });
  try {
    const reqId = reqIdFromReq(req) || req.headers['x-request-id'];
    logger.debug('geocode.route.search_incoming', sanitize({ reqId, q, limit: req.body.limit }));
    const result = await geocodeService.search(q, { limit: req.body.limit });
    logger.debug('geocode.route.search_result', sanitize({ reqId, q, result }));
    return res.json(result);
  } catch (err) {
    logger.error('geocode.route.search_error', sanitize({ error: err && (err.message || err) }));
    return res.status(500).json({ status: 'error', reason: 'server_error' });
  }
});

// POST /api/geocode/reverse
// body: { lat: 18.5204, lon: 73.8567 }
router.post('/reverse', async (req, res) => {
  const lat = parseFloat(req.body.lat || req.body.latitude);
  const lon = parseFloat(req.body.lon || req.body.longitude);
  if (!lat || !lon) return res.status(400).json({ status: 'error', reason: 'missing_coordinates' });
  try {
    const reqId = reqIdFromReq(req) || req.headers['x-request-id'];
    logger.debug('geocode.route.reverse_incoming', sanitize({ reqId, lat, lon }));
    const result = await geocodeService.reverse(lat, lon, { limit: req.body.limit });
    logger.debug('geocode.route.reverse_result', sanitize({ reqId, lat, lon, result }));
    return res.json(result);
  } catch (err) {
    logger.error('geocode.route.reverse_error', sanitize({ error: err && (err.message || err) }));
    return res.status(500).json({ status: 'error', reason: 'server_error' });
  }
});

// POST /api/geocode/lookup
// body: { osm_ids: 'R146656' } or { osm_ids: ['R146656','W123'] }
router.post('/lookup', async (req, res) => {
  let osm_ids = req.body.osm_ids || req.body.ids;
  if (!osm_ids) return res.status(400).json({ status: 'error', reason: 'missing_osm_ids' });
  if (Array.isArray(osm_ids)) osm_ids = osm_ids.join(',');
  try {
    const reqId = reqIdFromReq(req) || req.headers['x-request-id'];
    logger.debug('geocode.route.lookup_incoming', sanitize({ reqId, osm_ids }));
    const result = await geocodeService.lookup(osm_ids, { limit: req.body.limit });
    logger.debug('geocode.route.lookup_result', sanitize({ reqId, osm_ids, result }));
    return res.json(result);
  } catch (err) {
    logger.error('geocode.route.lookup_error', sanitize({ error: err && (err.message || err) }));
    return res.status(500).json({ status: 'error', reason: 'server_error' });
  }
});

// POST /api/geocode/structured
// body: { street, city, county, state, country, postalcode }
router.post('/structured', async (req, res) => {
  const allowed = ['street', 'city', 'county', 'state', 'country', 'postalcode'];
  const params = {};
  for (const k of allowed) if (req.body[k]) params[k] = req.body[k];
  if (!Object.keys(params).length) return res.status(400).json({ status: 'error', reason: 'missing_structured_fields' });
  try {
    const reqId = reqIdFromReq(req) || req.headers['x-request-id'];
    logger.debug('geocode.route.structured_incoming', sanitize({ reqId, params }));
    const result = await geocodeService.structuredSearch(params, { limit: req.body.limit });
    logger.debug('geocode.route.structured_result', sanitize({ reqId, params, result }));
    return res.json(result);
  } catch (err) {
    logger.error('geocode.route.structured_error', sanitize({ error: err && (err.message || err) }));
    return res.status(500).json({ status: 'error', reason: 'server_error' });
  }
});

// GET /api/geocode/proxy/* -> safe passthrough to maps.co for allowed endpoints
router.get('/proxy/*', async (req, res) => {
  const path = '/' + (req.params[0] || '');
  // Allow only specific paths
  const allowed = ['/search', '/reverse', '/lookup'];
  const found = allowed.find(a => path.startsWith(a));
  if (!found) return res.status(400).json({ status: 'error', reason: 'not_allowed' });
  try {
    const reqId = reqIdFromReq(req) || req.headers['x-request-id'];
    logger.debug('geocode.route.proxy_incoming', sanitize({ reqId, path, query: req.query }));
    const data = await geocodeService.callMapsCo(path, req.query, { timeout: 8000 });
    logger.debug('geocode.route.proxy_result', sanitize({ reqId, path, data }));
    return res.json({ status: 'ok', source: process.env.GEOCODE_MAPS_BASE || 'geocode.maps.co', data });
  } catch (err) {
    logger.error('geocode.route.proxy_error', sanitize({ error: err && (err.message || err) }));
    return res.status(502).json({ status: 'error', reason: 'upstream_error' });
  }
});

// GET /api/geocode/current-location - Get user's current location based on IP
router.get('/current-location', async (req, res) => {
  try {
    const reqId = reqIdFromReq(req) || req.headers['x-request-id'];
    logger.debug('geocode.route.current_location_incoming', sanitize({ reqId }));
    const result = await geocodeService.getCurrentLocation();
    logger.debug('geocode.route.current_location_result', sanitize({ reqId, result }));
    return res.json(result);
  } catch (err) {
    logger.error('geocode.route.current_location_error', sanitize({ error: err && (err.message || err) }));
    return res.status(500).json({ status: 'error', reason: 'server_error' });
  }
});

module.exports = router;
