const axios = require('axios');
const NodeCache = require('node-cache');
const { logger, sanitize, config } = require('../commons');

// Cache TTL from config
const GEOCODE_CACHE_TTL = config.cache.geocode.ttl;
const cache = new NodeCache({ stdTTL: GEOCODE_CACHE_TTL });
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

/**
 * Calls the Maps.co (or Nominatim fallback) geocoding API.
 * Includes automatic retry with exponential backoff and result caching.
 * 
 * @param {string} path - API endpoint path (e.g., '/search', '/reverse')
 * @param {Object} [params={}] - Query parameters
 * @param {Object} [opts={}] - Options including timeout and TTL
 * @returns {Promise<Object>} API response data
 * @throws {Error} If all retry attempts fail
 * @private
 */
async function callMapsCo(path, params = {}, opts = {}) {
  const base = config.geocode.baseUrl;
  const limit = params.limit || DEFAULT_LIMIT;
  const userAgent = config.geocode.userAgent;
  const headers = { 'User-Agent': userAgent, 'Accept-Language': 'en-US,en;q=0.9' };
  const url = `${base}${path}`;
  const cacheKey = makeCacheKey(path, { ...params, base });
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  // Retry/backoff parameters from config
  const RETRIES = config.retry.geocode.retries;
  const BASE_DELAY_MS = config.retry.geocode.baseDelayMs;
  const MAX_DELAY_MS = config.retry.geocode.maxDelayMs;

  // helper: sleep
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  async function doRequestWithRetry(requestUrl, requestParams, requestHeaders, timeoutMs) {
    let attempt = 0;
    while (true) {
      try {
        const resp = await axios.get(requestUrl, { params: requestParams, headers: requestHeaders, timeout: timeoutMs });
        return resp;
      } catch (err) {
        attempt++;
        const status = err && err.response && err.response.status;
        const isTransient = !err.response || RETRY.TRANSIENT_ERROR_CODES.includes(status);
        logger.debug('geocode:request_attempt_failed', sanitize({ url: requestUrl, attempt, status, message: err && err.message }));
        if (!isTransient || attempt > RETRIES) throw err;
        const delay = Math.min(BASE_DELAY_MS * Math.pow(2, attempt - 1) + Math.floor(Math.random() * 100), MAX_DELAY_MS);
        await sleep(delay);
      }
    }
  }

  try {
    const reqParams = { ...params, format: params.format || 'json', limit };
    // Prefer English responses where provider supports it
    reqParams['accept-language'] = reqParams['accept-language'] || 'en';
    // Request namedetails when possible (Nominatim supports namedetails=1)
    reqParams['namedetails'] = reqParams['namedetails'] || 1;
    if (GEOCODE_KEY) reqParams.api_key = GEOCODE_KEY;
    logger.debug('geocode:outgoing_request', sanitize({ url, params: reqParams }));
    const resp = await doRequestWithRetry(url, reqParams, headers, opts.timeout || config.geocode.timeout);
    logger.debug('geocode:outgoing_response', sanitize({ url, status: resp.status, data: resp.data }));
    cache.set(cacheKey, resp.data, opts.ttl || GEOCODE_CACHE_TTL);
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
        const resp2 = await doRequestWithRetry(nomUrl, fallbackParams, headers, 8000);
        logger.debug('geocode:outgoing_response_fallback', sanitize({ url: nomUrl, status: resp2.status, data: resp2.data }));
        cache.set(cacheKey, resp2.data, opts.ttl || GEOCODE_CACHE_TTL);
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

/**
 * Searches for locations by text query using geocoding service.
 * Returns structured location data with coordinates.
 * 
 * @param {string} q - Search query (e.g., "Mumbai, India" or "Times Square, New York")
 * @param {Object} [opts={}] - Search options
 * @param {number} [opts.limit=5] - Maximum number of results to return
 * @param {number} [opts.timeout] - Request timeout in milliseconds
 * @returns {Promise<Object>} Search results
 * @returns {string} returns.status - 'ok', 'ambiguous', or 'error'
 * @returns {string} returns.source - Provider name
 * @returns {Array<Object>} returns.suggestions - Location suggestions with lat/lon
 * @returns {Object} returns.place - First/best match location
 * 
 * @example
 * const result = await search('London, UK');
 * // { status: 'ok', suggestions: [...], place: { lat: 51.5074, lon: -0.1278, ... } }
 */
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

/**
 * Performs reverse geocoding to get location details from coordinates.
 * Converts latitude/longitude into human-readable address.
 * 
 * @param {number} lat - Latitude coordinate
 * @param {number} lon - Longitude coordinate
 * @param {Object} [opts={}] - Reverse geocoding options
 * @param {number} [opts.limit=1] - Maximum results to return
 * @param {number} [opts.timeout] - Request timeout in milliseconds
 * @returns {Promise<Object>} Location details
 * @returns {string} returns.status - 'ok' or 'error'
 * @returns {Array<Object>} returns.suggestions - Location suggestions
 * @returns {Object} returns.place - Primary location match
 * 
 * @example
 * const location = await reverse(19.0760, 72.8777);
 * // Returns location details for Mumbai coordinates
 */
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

/**
 * Looks up locations by OpenStreetMap IDs.
 * Useful for retrieving specific known locations.
 * 
 * @param {string} osm_ids - Comma-separated OSM IDs (e.g., "R123,N456")
 * @param {Object} [opts={}] - Lookup options
 * @param {number} [opts.limit=5] - Maximum results
 * @returns {Promise<Object>} Lookup results
 * @returns {string} returns.status - 'ok' or 'error'
 * @returns {Array<Object>} returns.suggestions - Matching locations
 */
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

/**
 * Searches for locations using structured address components.
 * More precise than free-text search when address parts are known.
 * 
 * @param {Object} [params={}] - Structured address parameters
 * @param {string} [params.street] - Street address
 * @param {string} [params.city] - City name
 * @param {string} [params.county] - County name
 * @param {string} [params.state] - State/province
 * @param {string} [params.country] - Country name
 * @param {string} [params.postalcode] - Postal/ZIP code
 * @param {Object} [opts={}] - Search options
 * @param {number} [opts.limit=5] - Maximum results
 * @returns {Promise<Object>} Search results with suggestions
 * 
 * @example
 * const result = await structuredSearch({ city: 'Mumbai', country: 'India' });
 */
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

/**
 * Maps raw geocoding provider response to standardized suggestion format.
 * Normalizes city names, country names, and coordinates.
 * 
 * @param {Object} item - Raw location item from provider
 * @returns {Object} Normalized location suggestion
 * @returns {string} returns.display_name - Full formatted address
 * @returns {string} returns.city - City name (English when available)
 * @returns {string} returns.country - Country name (English)
 * @returns {string} returns.countryCode - ISO country code
 * @returns {number} returns.lat - Latitude
 * @returns {number} returns.lon - Longitude
 * @returns {Object} returns.raw - Original provider response
 * @private
 */
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

/**
 * Gets the current location based on the requesting client's IP address.
 * Uses geolocation-db.com with ipify.org verification for IP consistency.
 * Results are cached for 5 minutes.
 * 
 * @returns {Promise<Object>} Current location data
 * @returns {string} returns.status - 'ok' or 'error'
 * @returns {string} returns.source - Provider name
 * @returns {Object} returns.ipVerification - IP verification details
 * @returns {Object} returns.location - Location data including country, city, coordinates
 * 
 * @example
 * const current = await getCurrentLocation();
 * // { status: 'ok', location: { city: 'Mumbai', country: 'India', ... } }
 */
async function getCurrentLocation() {
  const cacheKey = 'current-location';
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  try {
    // Fetch location data from geolocation-db.com
    const geoResp = await axios.get('https://geolocation-db.com/json/', {
      headers: { 'User-Agent': config.geocode.userAgent },
      timeout: 5000
    });
    
    // Verify IP with ipify.org
    const ipifyResp = await axios.get('https://api.ipify.org/?format=json', {
      headers: { 'User-Agent': config.geocode.userAgent },
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

/**
 * Convenience wrapper used by legacy callers/tests named `geocode`.
 * Validates input and throws on error conditions to match test expectations.
 */
async function geocode(q, opts = {}) {
  if (q === null || q === undefined) {
    throw new Error('Invalid location');
  }
  const qs = typeof q === 'string' ? q : (q.q || q.location || '');
  if (!qs || (typeof qs === 'string' && qs.trim() === '')) {
    throw new Error('Invalid location');
  }

  const res = await search(qs, opts);
  if (!res || res.status === 'error') {
    if (res && res.reason === 'no_results') {
      throw new Error('Could not find a matching place');
    }
    throw new Error('Geocoding failed');
  }
  return res;
}

module.exports = { search, reverse, lookup, structuredSearch, callMapsCo, getCurrentLocation, geocode };
