const axios = require('axios');
const NodeCache = require('node-cache');

const cache = new NodeCache({ stdTTL: 60 * 60 * 24 }); // 24h cache
const GEOCODE_KEY = process.env.GEOCODE_MAPS_KEY || '';

const DEFAULT_LIMIT = 5;

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
    if (GEOCODE_KEY) reqParams.api_key = GEOCODE_KEY;
    const resp = await axios.get(url, { params: reqParams, headers, timeout: opts.timeout || 6000 });
    cache.set(cacheKey, resp.data);
    return resp.data;
  } catch (err) {
    if (err.response) {
      console.warn('maps.co error', path, err.response.status, err.response.data);
    } else {
      console.warn('maps.co request failed', path, err.message);
    }
    // try fallback to Nominatim for compatible endpoints
    if (path.startsWith('/search') || path.startsWith('/reverse') || path.startsWith('/lookup')) {
      try {
        const nominatimBase = 'https://nominatim.openstreetmap.org';
        const nomUrl = `${nominatimBase}${path}`;
        const resp2 = await axios.get(nomUrl, { params: { ...params, format: params.format || 'json', limit }, headers, timeout: 8000 });
        cache.set(cacheKey, resp2.data);
        return resp2.data;
      } catch (err2) {
        if (err2.response) console.warn('nominatim error', err2.response.status, err2.response.data);
        else console.warn('nominatim request failed', err2.message);
        throw err2;
      }
    }
    throw err;
  }
}

async function search(q, opts = {}) {
  const params = { q, limit: opts.limit || DEFAULT_LIMIT };
  try {
    const data = await callMapsCo('/search', params, opts);
    if (!Array.isArray(data) || !data.length) return { status: 'error', reason: 'no_results' };
    const suggestions = (Array.isArray(data) ? data : []).slice(0, params.limit).map(item => mapItemToSuggestion(item));
    const result = { status: suggestions.length === 1 ? 'ok' : 'ambiguous', source: process.env.GEOCODE_MAPS_BASE || 'geocode.maps.co', suggestions, place: suggestions[0] };
    return result;
  } catch (err) {
    return { status: 'error', reason: 'provider_error' };
  }
}

async function reverse(lat, lon, opts = {}) {
  const params = { lat, lon, limit: opts.limit || 1 };
  try {
    const data = await callMapsCo('/reverse', params, opts);
    // reverse returns an object for maps.co / Nominatim; normalize to array for suggestions
    const arr = Array.isArray(data) ? data : [data];
    const suggestions = arr.slice(0, params.limit).map(item => mapItemToSuggestion(item));
    return { status: suggestions.length ? 'ok' : 'error', source: process.env.GEOCODE_MAPS_BASE || 'geocode.maps.co', suggestions, place: suggestions[0] };
  } catch (err) {
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
    const data = await callMapsCo('/search', p, opts);
    const suggestions = (Array.isArray(data) ? data : []).slice(0, p.limit).map(item => mapItemToSuggestion(item));
    return { status: suggestions.length ? 'ok' : 'error', source: process.env.GEOCODE_MAPS_BASE || 'geocode.maps.co', suggestions, place: suggestions[0] };
  } catch (err) {
    return { status: 'error', reason: 'provider_error' };
  }
}

function mapItemToSuggestion(item) {
  const addr = item.address || {};
  const city = addr.city || addr.town || addr.village || addr.county || item.name || (item.display_name && item.display_name.split(',')[0]);
  const country = addr.country || (item.display_name && item.display_name.split(',').slice(-1)[0]) || '';
  const countryCode = (addr.country_code || '').toUpperCase();
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
    console.error('current location error:', err.message);
    return { 
      status: 'error', 
      reason: 'provider_error',
      message: 'Failed to fetch current location from IP geolocation services'
    };
  }
}

module.exports = { search, reverse, lookup, structuredSearch, callMapsCo, getCurrentLocation };
