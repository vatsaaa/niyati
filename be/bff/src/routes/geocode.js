const express = require('express');
const router = express.Router();
const geocodeService = require('../services/geocodeService');

// POST /api/geocode  (alias for search)
// body: { q: 'Pune, Maharashtra' }
router.post('/', async (req, res) => {
  const q = (req.body.q || req.body.place || '').toString().trim();
  if (!q) return res.status(400).json({ status: 'error', reason: 'missing_query' });
  try {
    const result = await geocodeService.search(q);
    return res.json(result);
  } catch (err) {
    console.error('geocode error', err);
    return res.status(500).json({ status: 'error', reason: 'server_error' });
  }
});

// POST /api/geocode/search
router.post('/search', async (req, res) => {
  const q = (req.body.q || req.body.place || '').toString().trim();
  if (!q) return res.status(400).json({ status: 'error', reason: 'missing_query' });
  try {
    const result = await geocodeService.search(q, { limit: req.body.limit });
    return res.json(result);
  } catch (err) {
    console.error('geocode search error', err);
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
    const result = await geocodeService.reverse(lat, lon, { limit: req.body.limit });
    return res.json(result);
  } catch (err) {
    console.error('geocode reverse error', err);
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
    const result = await geocodeService.lookup(osm_ids, { limit: req.body.limit });
    return res.json(result);
  } catch (err) {
    console.error('geocode lookup error', err);
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
    const result = await geocodeService.structuredSearch(params, { limit: req.body.limit });
    return res.json(result);
  } catch (err) {
    console.error('geocode structured error', err);
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
    const data = await geocodeService.callMapsCo(path, req.query, { timeout: 8000 });
    return res.json({ status: 'ok', source: process.env.GEOCODE_MAPS_BASE || 'geocode.maps.co', data });
  } catch (err) {
    console.error('geocode proxy error', err);
    return res.status(502).json({ status: 'error', reason: 'upstream_error' });
  }
});

module.exports = router;
