const axios = require('axios');
const NodeCache = require('node-cache');
const { logger, sanitize } = require('../lib/logger');

const cache = new NodeCache({ stdTTL: 60 * 60 * 24 }); // 24h cache
const GEOCODE_KEY = process.env.GEOCODE_MAPS_KEY || '';

const DEFAULT_LIMIT = 5;

// Load English country names from the UI's countries.json (best-effort). If unavailable, fallback to whatever provider returns.
const fs = require('fs');
let COUNTRY_NAME_BY_CODE = {};
try {
  const countriesPath = `${__dirname}/../../../ui/public/countries.json`;
  const raw = fs.readFileSync(countriesPath, 'utf8');
  const parsed = JSON.parse(raw);
  if (parsed && Array.isArray(parsed.countries)) {
    COUNTRY_NAME_BY_CODE = parsed.countries.reduce((acc, c) => {
      if (c && c.code) acc[c.code.toString().toUpperCase()] = c.name || acc[c.code.toString().toUpperCase()];
      return acc;
    }, {});
  }
} catch (e) {
  // fail silently; mapping is optional
  logger.debug('geocode:country_map_load_failed', sanitize({ error: e && e.message }));
}

function makeCacheKey(path, params) {
  const s = `${path}:${Object.keys(params || {}).sort().map(k => `${k}=${params[k]}`).join('&')}`;
  return `geocode:${s}`;
}

async function callMapsCo(path, params = {}, opts = {}) {
  const base = process.env.GEOCODE_MAPS_BASE || 'https://geocode.maps.co';
  const limit = params.limit || DEFAULT_LIMIT;
  const userAgent = process.env.GEOCODE_USER_AGENT || 'niyati-bff/1.0 (+https://example.com)';
  const headers = { 'User-Agent': userAgent, 'Accept-Language': 'en-US,en;q=0.9' };
  const url = `${base}${path}`;
  const cacheKey = makeCacheKey(path, { ...params, base });
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  try {
    const reqParams = { ...params, format: params.format || 'json', limit };
      // Prefer English responses where provider supports it
      reqParams['accept-language'] = reqParams['accept-language'] || 'en';
      // Request namedetails when possible (Nominatim supports namedetails=1)
      reqParams['namedetails'] = reqParams['namedetails'] || 1;
    if (GEOCODE_KEY) reqParams.api_key = GEOCODE_KEY;
    logger.debug('geocode:outgoing_request', sanitize({ url, params: reqParams }));
    const resp = await axios.get(url, { params: reqParams, headers, timeout: opts.timeout || 6000 });
    logger.debug('geocode:outgoing_response', sanitize({ url, status: resp.status, data: resp.data }));
    cache.set(cacheKey, resp.data);
    return resp.data;
  } catch (err) {
    if (err.response) {
      logger.warn('maps.co error', sanitize({ path, status: err.response.status, data: err.response.data }));
    } else {
      logger.warn('maps.co request failed', sanitize({ path, message: err.message }));
    }
    // try fallback to Nominatim for compatible endpoints
    if (path.startsWith('/search') || path.startsWith('/reverse') || path.startsWith('/lookup')) {
      try {
        const nominatimBase = 'https://nominatim.openstreetmap.org';
        const nomUrl = `${nominatimBase}${path}`;
        logger.debug('geocode:outgoing_request_fallback', sanitize({ url: nomUrl, params: { ...params, format: params.format || 'json', limit } }));
        const fallbackParams = { ...params, format: params.format || 'json', limit, 'accept-language': 'en', namedetails: 1 };
        const resp2 = await axios.get(nomUrl, { params: fallbackParams, headers, timeout: 8000 });
        logger.debug('geocode:outgoing_response_fallback', sanitize({ url: nomUrl, status: resp2.status, data: resp2.data }));
        cache.set(cacheKey, resp2.data);
        return resp2.data;
      } catch (err2) {
        if (err2.response) logger.warn('nominatim error', sanitize({ status: err2.response.status, data: err2.response.data }));
        else logger.warn('nominatim request failed', sanitize({ message: err2.message }));
        throw err2;
      }
    }
    throw err;
  }
}

async function search(q, opts = {}) {
  const params = { q, limit: opts.limit || DEFAULT_LIMIT };
  try {
    logger.debug('geocode:search_incoming', sanitize({ q, params }));
    const data = await callMapsCo('/search', params, opts);
    if (!Array.isArray(data) || !data.length) return { status: 'error', reason: 'no_results' };
    const suggestions = (Array.isArray(data) ? data : []).slice(0, params.limit).map(item => mapItemToSuggestion(item));
    const result = { status: suggestions.length === 1 ? 'ok' : 'ambiguous', source: process.env.GEOCODE_MAPS_BASE || 'geocode.maps.co', suggestions, place: suggestions[0] };
    logger.debug('geocode:search_result', sanitize({ q, result }));
    return result;
  } catch (err) {
    logger.error('geocode:search_failed', sanitize({ q, error: err && err.message }));
    return { status: 'error', reason: 'provider_error' };
  }
}

async function reverse(lat, lon, opts = {}) {
  const params = { lat, lon, limit: opts.limit || 1 };
  try {
    logger.debug('geocode:reverse_incoming', sanitize({ lat, lon, params }));
    const data = await callMapsCo('/reverse', params, opts);
    // reverse returns an object for maps.co / Nominatim; normalize to array for suggestions
    const arr = Array.isArray(data) ? data : [data];
    const suggestions = arr.slice(0, params.limit).map(item => mapItemToSuggestion(item));
    logger.debug('geocode:reverse_result', sanitize({ lat, lon, suggestions }));
    return { status: suggestions.length ? 'ok' : 'error', source: process.env.GEOCODE_MAPS_BASE || 'geocode.maps.co', suggestions, place: suggestions[0] };
  } catch (err) {
    logger.error('geocode:reverse_failed', sanitize({ lat, lon, error: err && err.message }));
    return { status: 'error', reason: 'provider_error' };
  }
}

async function lookup(osm_ids, opts = {}) {
  const params = { osm_ids, limit: opts.limit || DEFAULT_LIMIT };
  try {
    const data = await callMapsCo('/lookup', params, opts);
    const arr = Array.isArray(data) ? data : [data];
    const suggestions = arr.slice(0, params.limit).map(item => mapItemToSuggestion(item));
    return { status: suggestions.length ? 'ok' : 'error', source: process.env.GEOCODE_MAPS_BASE || 'geocode.maps.co', suggestions, place: suggestions[0] };
  } catch (err) {
    return { status: 'error', reason: 'provider_error' };
  }
}

async function structuredSearch(params = {}, opts = {}) {
  // structured: pass supported fields (street, city, county, state, country, postalcode)
  const p = { ...params, limit: opts.limit || DEFAULT_LIMIT };
  try {
    logger.debug('geocode:structured_incoming', sanitize({ params: p }));
    const data = await callMapsCo('/search', p, opts);
    const suggestions = (Array.isArray(data) ? data : []).slice(0, p.limit).map(item => mapItemToSuggestion(item));
    logger.debug('geocode:structured_result', sanitize({ params: p, suggestions }));
    return { status: suggestions.length ? 'ok' : 'error', source: process.env.GEOCODE_MAPS_BASE || 'geocode.maps.co', suggestions, place: suggestions[0] };
  } catch (err) {
    logger.error('geocode:structured_failed', sanitize({ params: p, error: err && err.message }));
    return { status: 'error', reason: 'provider_error' };
  }
}

function mapItemToSuggestion(item) {
  const addr = item.address || {};
  let city = addr.city || addr.town || addr.village || addr.county || item.name || (item.display_name && item.display_name.split(',')[0]);
  let country = addr.country || (item.display_name && item.display_name.split(',').slice(-1)[0]) || '';
  const countryCode = (addr.country_code || (item && item.extratags && item.extratags.country_code) || '').toString().toUpperCase();

  // Prefer explicit English name tags if the provider returned them
  try {
    if (item && item.namedetails && (item.namedetails['name:en'] || item.namedetails['name:eng'])) {
      const nd = item.namedetails['name:en'] || item.namedetails['name:eng'];
      if (nd) city = nd;
    }
  } catch (e) {}
  try {
    if (item && item.extratags && (item.extratags['name:en'] || item.extratags['name:eng'])) {
      const et = item.extratags['name:en'] || item.extratags['name:eng'];
      if (et) city = et;
    }
  } catch (e) {}

  // Normalize country to English name when we have a mapping for countryCode
  if (countryCode && COUNTRY_NAME_BY_CODE[countryCode]) {
    const mappedCountry = COUNTRY_NAME_BY_CODE[countryCode];
    if (mappedCountry && mappedCountry !== country) {
      logger.debug('geocode:country_normalized', sanitize({ from: country, to: mappedCountry, countryCode }));
      country = mappedCountry;
    }
  }

  // If city is non-ASCII, try to extract an ASCII-friendly candidate from display_name
  const hasNonAscii = (str) => /[^\u0000-\u007F]/.test(str || '');
  if (city && hasNonAscii(city)) {
    if (item.display_name && typeof item.display_name === 'string') {
      const parts = item.display_name.split(',').map(p => p.trim()).filter(Boolean);
      const asciiCandidate = parts.find(p => /[A-Za-z]/.test(p));
      if (asciiCandidate) {
        logger.debug('geocode:city_normalized', sanitize({ from: city, to: asciiCandidate, countryCode }));
        city = asciiCandidate;
      }
    }
  }
  return {
    display_name: item.display_name,
    city,
    country,
    countryCode,
    lat: parseFloat(item.lat),
    lon: parseFloat(item.lon),
    raw: item
  };
}

async function getCurrentLocation() {
  const cacheKey = 'current-location';
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  try {
    // Fetch location data from geolocation-db.com
    const geoResp = await axios.get('https://geolocation-db.com/json/', {
      headers: { 'User-Agent': process.env.GEOCODE_USER_AGENT || 'niyati-bff/1.0' },
      timeout: 5000
    });
    
    // Verify IP with ipify.org
    const ipifyResp = await axios.get('https://api.ipify.org/?format=json', {
      headers: { 'User-Agent': process.env.GEOCODE_USER_AGENT || 'niyati-bff/1.0' },
      timeout: 5000
    });
    
    const geoData = geoResp.data;
    const ipifyData = ipifyResp.data;
    
    // Verify IP consistency
    const ipMatch = geoData.IPv4 === ipifyData.ip;
    
    const result = {
      status: 'ok',
      source: 'geolocation-db.com',
      ipVerification: {
        primary: geoData.IPv4,
        verification: ipifyData.ip,
        match: ipMatch,
        verifiedBy: 'api.ipify.org'
      },
      location: {
        // Core location data
        ip: geoData.IPv4,
        country: geoData.country_name,
        countryCode: geoData.country_code,
        state: geoData.state,
        city: geoData.city,
        postal: geoData.postal,
        latitude: parseFloat(geoData.latitude),
        longitude: parseFloat(geoData.longitude),
        timezone: geoData.timezone,
        // Additional raw fields that might be useful
        ...Object.fromEntries(
          Object.entries(geoData).filter(([key, value]) => 
            !['IPv4', 'country_name', 'country_code', 'state', 'city', 'postal', 'latitude', 'longitude', 'timezone'].includes(key) &&
            value !== null && value !== undefined && value !== ''
          )
        )
      }
    };
    
    // Cache for 5 minutes (IP location doesn't change frequently)
    cache.set(cacheKey, result, 300);
    return result;
    
  } catch (err) {
    logger.error(sanitize({ msg: 'current location error', error: err && err.message }));
    return { 
      status: 'error', 
      reason: 'provider_error',
      message: 'Failed to fetch current location from IP geolocation services'
    };
  }
}

module.exports = { search, reverse, lookup, structuredSearch, callMapsCo, getCurrentLocation };
