const axios = require('axios');
const { logger, sanitize } = require('../src/lib/logger');

const base = process.env.BFF_BASE || 'http://localhost:3000';

async function testGeocode() {
  logger.info(sanitize({ msg: 'Geocode: Search' }));
  try {
    const resp = await axios.post(`${base}/api/geocode/search`, { q: 'Pune, India', limit: 3 }, { timeout: 10000 });
    logger.info(sanitize({ msg: 'Geocode: Search Result', status: resp.status, body: resp.data }));
    return resp.data;
  } catch (err) {
    logger.error(sanitize({ msg: 'Geocode search error', error: err.message }));
    if (err.response) logger.error(sanitize({ msg: 'Geocode search response', status: err.response.status, body: err.response.data }));
    return null;
  }
}

async function testGeocodeReverse() {
  logger.info(sanitize({ msg: 'Geocode: Reverse' }));
  try {
    const resp = await axios.post(`${base}/api/geocode/reverse`, { lat: 18.5204, lon: 73.8567 }, { timeout: 10000 });
    logger.info(sanitize({ msg: 'Geocode: Reverse Result', status: resp.status, body: resp.data }));
  } catch (err) {
    logger.error(sanitize({ msg: 'Geocode reverse error', error: err.message }));
    if (err.response) logger.error(sanitize({ msg: 'Geocode reverse response', status: err.response.status, body: err.response.data }));
  }
}

async function testGeocodeLookup(fromSearch) {
  logger.info(sanitize({ msg: 'Geocode: Lookup' }));
  try {
    if (!fromSearch || !fromSearch.suggestions || !fromSearch.suggestions.length) {
      logger.info(sanitize({ msg: 'No search suggestions available to derive OSM id for lookup. Skipping lookup test.' }));
      return;
    }
    const first = fromSearch.suggestions[0];
    const raw = first.raw || {};
    const osm_id = raw.osm_id;
    const osm_type = raw.osm_type; // 'node' | 'way' | 'relation'
    if (!osm_id || !osm_type) {
      logger.info(sanitize({ msg: 'No osm_id/osm_type on first suggestion. Skipping lookup.' }));
      return;
    }
    const prefix = osm_type.startsWith('relation') ? 'R' : osm_type.startsWith('way') ? 'W' : 'N';
    const osm_ids = `${prefix}${osm_id}`;
    const resp = await axios.post(`${base}/api/geocode/lookup`, { osm_ids }, { timeout: 10000 });
    logger.info(sanitize({ msg: 'Geocode: Lookup Result', status: resp.status, body: resp.data }));
  } catch (err) {
    logger.error(sanitize({ msg: 'Geocode lookup error', error: err.message }));
    if (err.response) logger.error(sanitize({ msg: 'Geocode lookup response', status: err.response.status, body: err.response.data }));
  }
}

async function testGeocodeStructured() {
  logger.info(sanitize({ msg: 'Geocode: Structured' }));
  try {
    const resp = await axios.post(`${base}/api/geocode/structured`, { street: 'FC Road', city: 'Pune', country: 'India', limit: 3 }, { timeout: 10000 });
    logger.info(sanitize({ msg: 'Geocode: Structured Result', status: resp.status, body: resp.data }));
  } catch (err) {
    logger.error(sanitize({ msg: 'Geocode structured error', error: err.message }));
    if (err.response) logger.error(sanitize({ msg: 'Geocode structured response', status: err.response.status, body: err.response.data }));
  }
}

async function testGeocodeProxySearch() {
  logger.info(sanitize({ msg: 'Geocode: Proxy Search' }));
  try {
    const resp = await axios.get(`${base}/api/geocode/proxy/search`, { params: { q: 'Pune, India', limit: 2 }, timeout: 10000 });
    logger.info(sanitize({ msg: 'Geocode: Proxy Search Result', status: resp.status, body: resp.data }));
  } catch (err) {
    logger.error(sanitize({ msg: 'Geocode proxy search error', error: err.message }));
    if (err.response) logger.error(sanitize({ msg: 'Geocode proxy search response', status: err.response.status, body: err.response.data }));
  }
}

async function testCurrentLocation() {
  try {
    const resp = await axios.get(`${base}/api/geocode/current-location`, { timeout: 10000 });
    logger.info(sanitize({ msg: 'Geocode: Current Location Result', status: resp.status, body: resp.data }));
  } catch (err) {
    logger.error(sanitize({ msg: 'Current location error', error: err.message }));
    if (err.response) logger.error(sanitize({ msg: 'Current location response', status: err.response.status, body: err.response.data }));
  }
}

async function testAstroProbe() {
  logger.info(sanitize({ msg: 'Astrology: Probe' }));
  try {
    const resp = await axios.post(`${base}/api/astrology/probe`, {}, { timeout: 20000 });
    logger.info(sanitize({ msg: 'Astrology: Probe Result', status: resp.status, body: resp.data }));
  } catch (err) {
    logger.error(sanitize({ msg: 'Astro probe error', error: err.message }));
    if (err.response) logger.error(sanitize({ msg: 'Astro probe response', status: err.response.status, body: err.response.data }));
  }
}

async function testAstroCompute() {
  logger.info(sanitize({ msg: 'Astrology: Compute' }));
  const payload = {
    profile: {
      name: 'Test User',
      dob: '1990-11-23',
      timeOfBirth: '07:30',
      placeOfBirth: { raw: 'Pune, India', city: 'Pune', countryCode: 'IN', lat: 18.5204, lng: 73.8567 }
    }
  };
  try {
    const resp = await axios.post(`${base}/api/astrology/compute`, payload, { timeout: 20000 });
    logger.info(sanitize({ msg: 'Astrology: Compute Result', status: resp.status, body: resp.data }));
  } catch (err) {
    logger.error(sanitize({ msg: 'Astrology compute error', error: err.message }));
    if (err.response) logger.error(sanitize({ msg: 'Astrology compute response', status: err.response.status, body: err.response.data }));
  }
}

async function testAstroGeoDetails() {
  logger.info(sanitize({ msg: 'Astrology: Geo-Details' }));
  try {
    const resp = await axios.post(`${base}/api/astrology/geo-details`, { q: 'Pune, India' }, { timeout: 15000 });
    logger.info(sanitize({ msg: 'Astrology: Geo-Details Result', status: resp.status, body: resp.data }));
  } catch (err) {
    logger.error(sanitize({ msg: 'Astrology geo-details error', error: err.message }));
    if (err.response) logger.error(sanitize({ msg: 'Astrology geo-details response', status: err.response.status, body: err.response.data }));
  }
}

async function testAstroPlanets() {
  logger.info(sanitize({ msg: 'Astrology: Planets' }));
  const payload = {
    name: 'Test User',
    dob: '1990-11-23',
    time: '07:30',
    place: { lat: 18.5204, lng: 73.8567 }
  };
  try {
    const resp = await axios.post(`${base}/api/astrology/planets`, payload, { timeout: 20000 });
    logger.info(sanitize({ msg: 'Astrology: Planets Result', status: resp.status, body: resp.data }));
  } catch (err) {
    logger.error(sanitize({ msg: 'Astrology planets error', error: err.message }));
    if (err.response) logger.error(sanitize({ msg: 'Astrology planets response', status: err.response.status, body: err.response.data }));
  }
}

async function run() {
  const searchResult = await testGeocode();
  await testGeocodeReverse();
  await testGeocodeLookup(searchResult);
  await testGeocodeStructured();
  await testGeocodeProxySearch();
  await testCurrentLocation();

  await testAstroProbe();
  await testAstroCompute();
  await testAstroGeoDetails();
  await testAstroPlanets();
}

run().catch(e => { logger.error(sanitize({ msg: 'Test script failed', error: e && (e.message || e) })); process.exit(1); });
