const express = require('express');
const router = express.Router();
const geocodeService = require('../services/geocodeService');
const { logger, sanitize, reqIdFromReq, ErrorCodes, config } = require('../../commons');

// POST /api/v1/geocode  (alias for search)
// body: { q: 'Pune, Maharashtra' }
router.post('/', async (req, res) => {
  const q = (req.body.q || req.body.place || req.body.location || '').toString().trim();
  if (!q) return res.sendError(ErrorCodes.MISSING_REQUIRED_FIELD, 'Missing required field: q or place');
  try {
    const reqId = req._niyati_reqId;
    logger.debug('geocode.route.search_incoming', sanitize({ reqId, q }));
    const result = await geocodeService.search(q);
    logger.debug('geocode.route.search_result', sanitize({ reqId, q, result }));
    if (result && result.status === 'error') {
      if (result.reason === 'no_results') return res.sendError(ErrorCodes.NO_RESULTS, 'Could not find a matching place');
      return res.sendError(ErrorCodes.PROVIDER_ERROR, 'Failed to geocode location');
    }
    return res.sendSuccess(result);
  } catch (err) {
    logger.error('geocode.route.error', sanitize({ error: err && (err.message || err) }));
    return res.sendError(ErrorCodes.PROVIDER_ERROR, 'Failed to geocode location');
  }
});

// POST /api/v1/geocode/search
router.post('/search', async (req, res) => {
  const q = (req.body.q || req.body.place || req.body.location || '').toString().trim();
  if (!q) return res.sendError(ErrorCodes.MISSING_REQUIRED_FIELD, 'Missing required field: q or place');
  try {
    const reqId = req._niyati_reqId;
    logger.debug('geocode.route.search_incoming', sanitize({ reqId, q, limit: req.body.limit }));
    const result = await geocodeService.search(q, { limit: req.body.limit });
    logger.debug('geocode.route.search_result', sanitize({ reqId, q, result }));
    if (result && result.status === 'error') {
      if (result.reason === 'no_results') return res.sendError(ErrorCodes.NO_RESULTS, 'Could not find a matching place');
      return res.sendError(ErrorCodes.PROVIDER_ERROR, 'Failed to search location');
    }
    return res.sendSuccess(result);
  } catch (err) {
    logger.error('geocode.route.search_error', sanitize({ error: err && (err.message || err) }));
    return res.sendError(ErrorCodes.PROVIDER_ERROR, 'Failed to search location');
  }
});

// POST /api/v1/geocode/reverse
// body: { lat: 18.5204, lon: 73.8567 }
router.post('/reverse', async (req, res) => {
  const lat = parseFloat(req.body.lat || req.body.latitude);
  const lon = parseFloat(req.body.lon || req.body.longitude);
  if (!lat || !lon) return res.sendError(ErrorCodes.MISSING_REQUIRED_FIELD, 'Missing required fields: lat and lon');
  try {
    const reqId = req._niyati_reqId;
    logger.debug('geocode.route.reverse_incoming', sanitize({ reqId, lat, lon }));
    const result = await geocodeService.reverse(lat, lon, { limit: req.body.limit });
    logger.debug('geocode.route.reverse_result', sanitize({ reqId, lat, lon, result }));
    return res.sendSuccess(result);
  } catch (err) {
    logger.error('geocode.route.reverse_error', sanitize({ error: err && (err.message || err) }));
    return res.sendError(ErrorCodes.PROVIDER_ERROR, 'Failed to reverse geocode coordinates');
  }
});

// POST /api/v1/geocode/lookup
// body: { osm_ids: 'R146656' } or { osm_ids: ['R146656','W123'] }
router.post('/lookup', async (req, res) => {
  let osm_ids = req.body.osm_ids || req.body.ids;
  if (!osm_ids) return res.sendError(ErrorCodes.MISSING_REQUIRED_FIELD, 'Missing required field: osm_ids');
  if (Array.isArray(osm_ids)) osm_ids = osm_ids.join(',');
  try {
    const reqId = req._niyati_reqId;
    logger.debug('geocode.route.lookup_incoming', sanitize({ reqId, osm_ids }));
    const result = await geocodeService.lookup(osm_ids, { limit: req.body.limit });
    logger.debug('geocode.route.lookup_result', sanitize({ reqId, osm_ids, result }));
    return res.sendSuccess(result);
  } catch (err) {
    logger.error('geocode.route.lookup_error', sanitize({ error: err && (err.message || err) }));
    return res.sendError(ErrorCodes.PROVIDER_ERROR, 'Failed to lookup OSM IDs');
  }
});

// POST /api/v1/geocode/structured
// body: { street, city, county, state, country, postalcode }
router.post('/structured', async (req, res) => {
  const allowed = ['street', 'city', 'county', 'state', 'country', 'postalcode'];
  const params = {};
  for (const k of allowed) if (req.body[k]) params[k] = req.body[k];
  if (!Object.keys(params).length) return res.sendError(ErrorCodes.MISSING_REQUIRED_FIELD, 'At least one structured field required (street, city, county, state, country, postalcode)');
  try {
    const reqId = req._niyati_reqId;
    logger.debug('geocode.route.structured_incoming', sanitize({ reqId, params }));
    const result = await geocodeService.structuredSearch(params, { limit: req.body.limit });
    logger.debug('geocode.route.structured_result', sanitize({ reqId, params, result }));
    return res.sendSuccess(result);
  } catch (err) {
    logger.error('geocode.route.structured_error', sanitize({ error: err && (err.message || err) }));
    return res.sendError(ErrorCodes.PROVIDER_ERROR, 'Failed to search structured location');
  }
});

// GET /api/v1/geocode/proxy/* -> safe passthrough to maps.co for allowed endpoints
router.get('/proxy/*', async (req, res) => {
  const path = '/' + (req.params[0] || '');
  // Allow only specific paths
  const allowed = ['/search', '/reverse', '/lookup'];
  const found = allowed.find(a => path.startsWith(a));
  if (!found) return res.sendError(ErrorCodes.FORBIDDEN, 'Proxy path not allowed');
  try {
    const reqId = req._niyati_reqId;
    logger.debug('geocode.route.proxy_incoming', sanitize({ reqId, path, query: req.query }));
    const data = await geocodeService.callMapsCo(path, req.query, { timeout: config.geocode.timeout });
    logger.debug('geocode.route.proxy_result', sanitize({ reqId, path, data }));
    return res.sendSuccess({ source: config.geocode.baseUrl, data });
  } catch (err) {
    logger.error('geocode.route.proxy_error', sanitize({ error: err && (err.message || err) }));
    return res.sendError(ErrorCodes.PROVIDER_ERROR, 'Failed to proxy geocode request', { statusCode: 502 });
  }
});

// GET /api/v1/geocode/current-location - Get user's current location based on IP
router.get('/current-location', async (req, res) => {
  try {
    const reqId = req._niyati_reqId;
    logger.debug('geocode.route.current_location_incoming', sanitize({ reqId }));
    const result = await geocodeService.getCurrentLocation();
    logger.debug('geocode.route.current_location_result', sanitize({ reqId, result }));
    return res.sendSuccess(result);
  } catch (err) {
    logger.error('geocode.route.current_location_error', sanitize({ error: err && (err.message || err) }));
    return res.sendError(ErrorCodes.PROVIDER_ERROR, 'Failed to get current location');
  }
});

module.exports = router;
