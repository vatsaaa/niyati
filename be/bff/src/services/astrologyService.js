const axios = require('axios');
const NodeCache = require('node-cache');
const crypto = require('crypto');

const cache = new NodeCache({ stdTTL: 60 * 60 * 24, checkperiod: 120 }); // 24h cache

function makeCacheKey(profile) {
  const hash = crypto.createHash('sha256').update(JSON.stringify(profile)).digest('hex');
  return `astro:${hash}`;
}

async function callProvider(profile) {
  const configured = process.env.ASTRO_API_URL || 'https://json.freeastrologyapi.com';
  const key = process.env.ASTRO_API_KEY;
  if (!configured) throw new Error('no_provider_configured');

  // Decide provider endpoint and payload shape. Support FreeAstrology and apiastro sample.
  const base = configured.replace(/\/$/, '');
  let url;
  let payload;
  const headers = { 'Content-Type': 'application/json' };
  if (key) headers['x-api-key'] = key;
  // Some providers use Bearer token in Authorization header instead
  if (process.env.ASTRO_API_TOKEN) headers['Authorization'] = `Bearer ${process.env.ASTRO_API_TOKEN}`;

  // If user configured apiastro host or the configured URL already includes the planets/extended path,
  // use the planets/extended payload shape from the docs.
  if (base.includes('json.apiastro.com') || base.includes('/planets/extended')) {
    url = base.endsWith('/planets/extended') ? base : base + '/planets/extended';

    // Build planets/extended payload from profile
    // dob: YYYY-MM-DD, timeOfBirth maybe HH:MM or HH:MM:SS
    const [year, month, day] = (profile.dob || '').split('-').map(s => parseInt(s, 10));
    let hours = 0, minutes = 0, seconds = 0;
    if (profile.timeOfBirth) {
      const parts = (profile.timeOfBirth || '').split(':').map(s => parseInt(s, 10));
      hours = parts[0] || 0; minutes = parts[1] || 0; seconds = parts[2] || 0;
    }

    const lat = profile.placeOfBirth && (profile.placeOfBirth.lat || profile.placeOfBirth.latitude || profile.placeOfBirth.lng ? profile.placeOfBirth.lat : null);
    const lon = profile.placeOfBirth && (profile.placeOfBirth.lng || profile.placeOfBirth.lon || profile.placeOfBirth.longitude ? profile.placeOfBirth.lng : null);

    // timezone: try env override, else infer for India (5.5) or default 0
    const tz = parseFloat(process.env.ASTRO_DEFAULT_TIMEZONE || (profile.placeOfBirth && profile.placeOfBirth.countryCode === 'IN' ? '5.5' : '0'));

    payload = {
      year: year || new Date().getUTCFullYear(),
      month: month || (new Date().getUTCMonth() + 1),
      date: day || new Date().getUTCDate(),
      hours: Number.isFinite(hours) ? hours : 0,
      minutes: Number.isFinite(minutes) ? minutes : 0,
      seconds: Number.isFinite(seconds) ? seconds : 0,
      latitude: (profile.placeOfBirth && (profile.placeOfBirth.lat || profile.placeOfBirth.latitude)) || 0,
      longitude: (profile.placeOfBirth && (profile.placeOfBirth.lng || profile.placeOfBirth.lon || profile.placeOfBirth.longitude)) || 0,
      timezone: tz,
      settings: {
        observation_point: 'topocentric',
        ayanamsha: 'lahiri',
        language: 'en'
      }
    };
  } else {
    // Default: FreeAstrologyAPI compute shape (send profile as-is)
    url = base + (base.endsWith('/v1/compute') ? '' : '/v1/compute');
    payload = {
      name: profile.name,
      dob: profile.dob,
      timeOfBirth: profile.timeOfBirth,
      placeOfBirth: profile.placeOfBirth
    };
  }

  const resp = await axios.post(url, payload, { headers, timeout: 12_000 });
  return resp.data;
}

function normalizeProviderResponse(providerName, raw, profile) {
  // Try to extract common fields; otherwise surface raw payload
  let sun = null, moon = null, ascendant = null, summary = null;

  if (raw) {
    // Common possible locations for values
    // Check raw.output (apiastro) first, then other common shapes
    const out = raw.output || raw.data || raw;
    // apiastro uses keys like 'Sun', 'Moon', 'Ascendant' under output
    sun = out?.Sun?.zodiac_sign_name || out?.sun || out?.sun_sign || raw.sun || null;
    moon = out?.Moon?.zodiac_sign_name || out?.moon || out?.moon_sign || raw.moon || null;
    ascendant = out?.Ascendant?.zodiac_sign_name || out?.Ascendant?.zodiac_sign_name || out?.ascendant || raw.ascendant || null;
    summary = raw.summary || raw.description || raw.horoscope || null;
  }

  if (!summary) {
    const pieces = [];
    if (sun) pieces.push(`Sun: ${sun}`);
    if (moon) pieces.push(`Moon: ${moon}`);
    if (ascendant) pieces.push(`Asc: ${ascendant}`);
    summary = pieces.length ? pieces.join(', ') : `Astrology computed for ${profile.name || 'User'}`;
  }

  return {
    status: 'ok',
    source: providerName || 'unknown',
    summary,
    data: {
      sun,
      moon,
      ascendant,
      raw: raw || null,
      computedAt: new Date().toISOString()
    }
  };
}

function makeMockResponse(profile) {
  const summary = `Mocked astrology summary for ${profile.name || 'User'} (DOB ${profile.dob || 'unknown'})`;
  return {
    status: 'ok',
    source: 'mocked-astrology',
    summary,
    data: {
      sun: 'Unknown',
      moon: 'Unknown',
      ascendant: 'Unknown',
      raw: null,
      computedAt: new Date().toISOString()
    }
  };
}

async function compute(profile) {
  if (!profile || !profile.dob || !profile.placeOfBirth) {
    const err = new Error('missing_profile_fields');
    err.code = 'missing_profile_fields';
    throw err;
  }

  const cacheKey = makeCacheKey(profile);
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  const url = process.env.ASTRO_API_URL;
  if (!url) {
    const mock = makeMockResponse(profile);
    cache.set(cacheKey, mock);
    return mock;
  }

  try {
    const raw = await callProvider(profile);
    const normalized = normalizeProviderResponse('freeastrology', raw, profile);
    cache.set(cacheKey, normalized);
    return normalized;
  } catch (err) {
    // Detailed logging to help diagnose provider errors (do not expose keys)
    if (err && err.response) {
      console.warn('Astrology provider call failed:', err.response.status, err.response.data);
    } else {
      console.warn('Astrology provider call failed:', err && err.message);
    }
    // Do NOT silently return a mock when the provider is configured and fails.
    // Throw so the route can return a 500 and surface the provider failure during debugging.
    const e = new Error('provider_error');
    e.original = err;
    throw e;
  }
}

module.exports = { compute, _cache: cache };

async function geoDetails(query) {
  // query can be { q: 'Pune, India' } or { lat, lon } or a placeOfBirth object
  const configured = process.env.ASTRO_API_URL || 'https://json.freeastrologyapi.com';
  const key = process.env.ASTRO_API_KEY;
  const base = configured.replace(/\/$/, '');
  if (!configured) {
    return { status: 'error', reason: 'no_provider_configured' };
  }

  const headers = { 'Content-Type': 'application/json' };
  if (key) headers['x-api-key'] = key;

  // include the documented '/geo-details' path used by FreeAstrologyAPI and prefer it
  const candidates = ['/geo-details', '/v1/geo/details', '/v1/geo', '/geo/details', '/geo', '/v1/location', '/location'];
  let lastErr = null;
  for (const p of candidates) {
    const url = base + (p.startsWith('/') ? p : `/${p}`);
    try {
      // The docs show a POST to '/geo-details' with { location: 'New Delhi' }.
      // Prefer POST for that specific path; for others try GET then POST.
      let resp;
      if (p === '/geo-details') {
        // allow query to be string or object; build body accordingly
        const body = typeof query === 'string' ? { location: query } : (query && query.location) ? { location: query.location } : (query && query.q) ? { location: query.q } : query || {};
        resp = await axios.post(url, body, { headers, timeout: 8000, validateStatus: null });
        if (resp.status >= 200 && resp.status < 300 && resp.data) return { status: 'ok', source: url, data: resp.data };
        lastErr = resp;
      } else {
        // Prefer GET when query is simple; otherwise POST
        if (query && (query.lat || query.lon || query.q || query.location)) {
          // Try GET with params first
          resp = await axios.get(url, { params: query, headers, timeout: 8000, validateStatus: null });
          if (resp.status >= 200 && resp.status < 300 && resp.data) return { status: 'ok', source: url, data: resp.data };
          // If GET returned 405 or similar, try POST
          if (resp.status >= 400 && resp.status < 500) {
            const r2 = await axios.post(url, query, { headers, timeout: 8000, validateStatus: null });
            if (r2.status >= 200 && r2.status < 300 && r2.data) return { status: 'ok', source: url, data: r2.data };
            lastErr = r2;
          } else {
            lastErr = resp;
          }
        } else {
          // no clear params: POST empty body
          resp = await axios.post(url, {}, { headers, timeout: 8000, validateStatus: null });
          if (resp.status >= 200 && resp.status < 300 && resp.data) return { status: 'ok', source: url, data: resp.data };
          lastErr = resp;
        }
      }
    } catch (err) {
      lastErr = err;
      // continue trying others
      if (err && err.response) {
        console.warn('geoDetails candidate failed', url, err.response.status, err.response.data);
      } else {
        console.warn('geoDetails request failed', url, err && err.message);
      }
    }
  }

  // If all candidates failed, return a structured error
  return { status: 'error', reason: 'provider_error', details: lastErr && (lastErr.data || lastErr.response && lastErr.response.data) };
}

module.exports = { compute, _cache: cache, geoDetails };

async function planets(payloadOrProfile) {
  const configured = process.env.ASTRO_API_URL || 'https://json.freeastrologyapi.com';
  const key = process.env.ASTRO_API_KEY;
  const base = configured.replace(/\/$/, '');
  if (!configured) throw new Error('no_provider_configured');

  const headers = { 'Content-Type': 'application/json' };
  if (key) headers['x-api-key'] = key;

  // If a full payload is provided, use it. Otherwise try to build from profile-like object.
  let payload = payloadOrProfile || {};
  if (payload && payload.profile) payload = payload.profile;

  // Accept several profile shapes: { dob, timeOfBirth, placeOfBirth } or { dob, time, place }
  const hasDob = !!(payload && payload.dob);
  const hasTime = !!(payload && (payload.timeOfBirth || payload.time));
  const hasPlace = !!(payload && (payload.placeOfBirth || payload.place));

  if (hasDob && hasPlace && (hasTime || payload.hours !== undefined)) {
    const [year, month, date] = (payload.dob || '').split('-').map(s => parseInt(s, 10));
    const timeStr = payload.timeOfBirth || payload.time || '00:00:00';
    const parts = ('' + timeStr).split(':').map(s => parseInt(s, 10));
    const hours = parts[0] || 0, minutes = parts[1] || 0, seconds = parts[2] || 0;
    const place = payload.placeOfBirth || payload.place || {};
    const latitude = (place && (place.lat || place.latitude)) || 0;
    const longitude = (place && (place.lng || place.lon || place.longitude)) || 0;
    const countryCode = (place && place.countryCode) || (place && place.country) || undefined;
    const timezone = parseFloat(process.env.ASTRO_DEFAULT_TIMEZONE || (countryCode === 'IN' ? '5.5' : '0'));
    payload = {
      year: year || new Date().getUTCFullYear(),
      month: month || (new Date().getUTCMonth() + 1),
      date: date || new Date().getUTCDate(),
      hours,
      minutes,
      seconds,
      latitude,
      longitude,
      timezone,
      settings: payload.settings || { observation_point: 'topocentric', ayanamsha: 'lahiri' }
    };
  }

  const candidates = ['/planets', '/v1/planets', '/planets/extended', '/v1/planets/extended'];
  let lastErr = null;

  // Prepare alternate payload shapes: numeric/extended (already in `payload`) and a simple user-style payload
  const simplePayload = (function buildSimple() {
    // If original input looked like profile (payloadOrProfile), try to reconstruct a simple payload
    try {
      if (payloadOrProfile && payloadOrProfile.name && payloadOrProfile.dob) {
        return {
          name: payloadOrProfile.name,
          dob: payloadOrProfile.dob,
          time: payloadOrProfile.timeOfBirth || payloadOrProfile.time || payloadOrProfile.time_of_birth || undefined,
          place: payloadOrProfile.placeOfBirth || payloadOrProfile.place || undefined
        };
      }
      // If we have numeric year/month/date/hours, convert to dob/time/place
      if (payload && payload.year && payload.month && payload.date) {
        const dob = `${payload.year.toString().padStart(4,'0')}-${(payload.month||0).toString().padStart(2,'0')}-${(payload.date||0).toString().padStart(2,'0')}`;
        const time = `${(payload.hours||0).toString().padStart(2,'0')}:${(payload.minutes||0).toString().padStart(2,'0')}:${(payload.seconds||0).toString().padStart(2,'0')}`;
        return { dob, time, place: { lat: payload.latitude, lng: payload.longitude } };
      }
    } catch (e) {
      // fallthrough
    }
    return null;
  })();

  const variants = [payload];
  if (simplePayload) variants.push(simplePayload);

  for (const p of candidates) {
    const url = base + (p.startsWith('/') ? p : `/${p}`);
    for (const v of variants) {
      try {
        console.debug('planets: trying', url, 'payload-shape', v && v.name ? 'simple' : 'numeric');
        const resp = await axios.post(url, v, { headers, timeout: 12_000, validateStatus: null });
        if (resp.status >= 200 && resp.status < 300) return resp.data;
        lastErr = resp;
        console.warn('planets candidate non-2xx', url, resp.status, { payload: v, response: resp.data });
      } catch (err) {
        lastErr = err;
        if (err && err.response) console.warn('planets request failed', url, { payload: v, status: err.response.status, body: err.response.data });
        else console.warn('planets request failed', url, { payload: v, message: err && err.message });
      }
    }
  }

  const e = new Error('provider_error');
  e.original = lastErr;
  throw e;
}

module.exports = { compute, _cache: cache, geoDetails, planets };

async function navamsa(payloadOrProfile) {
  const configured = process.env.ASTRO_API_URL || 'https://json.freeastrologyapi.com';
  const key = process.env.ASTRO_API_KEY;
  const base = configured.replace(/\/$/, '');
  if (!configured) throw new Error('no_provider_configured');

  const headers = { 'Content-Type': 'application/json' };
  if (key) headers['x-api-key'] = key;
  if (process.env.ASTRO_API_TOKEN) headers['Authorization'] = `Bearer ${process.env.ASTRO_API_TOKEN}`;

  // build numeric payload if a profile-like shape provided
  let payload = payloadOrProfile || {};
  if (payload && payload.profile) payload = payload.profile;
  const hasDob = !!(payload && payload.dob);
  const hasTime = !!(payload && (payload.timeOfBirth || payload.time));
  const hasPlace = !!(payload && (payload.placeOfBirth || payload.place));
  if (hasDob && hasPlace && (hasTime || payload.hours !== undefined)) {
    const [year, month, date] = (payload.dob || '').split('-').map(s => parseInt(s, 10));
    const timeStr = payload.timeOfBirth || payload.time || '00:00:00';
    const parts = ('' + timeStr).split(':').map(s => parseInt(s, 10));
    const hours = parts[0] || 0, minutes = parts[1] || 0, seconds = parts[2] || 0;
    const place = payload.placeOfBirth || payload.place || {};
    const latitude = (place && (place.lat || place.latitude)) || 0;
    const longitude = (place && (place.lng || place.lon || place.longitude)) || 0;
    const countryCode = (place && place.countryCode) || (place && place.country) || undefined;
    const timezone = parseFloat(process.env.ASTRO_DEFAULT_TIMEZONE || (countryCode === 'IN' ? '5.5' : '0'));
    payload = {
      year: year || new Date().getUTCFullYear(),
      month: month || (new Date().getUTCMonth() + 1),
      date: date || new Date().getUTCDate(),
      hours,
      minutes,
      seconds,
      latitude,
      longitude,
      timezone,
      settings: payload.settings || { observation_point: 'topocentric', ayanamsha: 'lahiri' }
    };
  }

  const candidates = ['/navamsa-chart-info', '/v1/navamsa-chart-info', '/navamsa', '/v1/navamsa'];
  let lastErr = null;
  for (const p of candidates) {
    const url = base + (p.startsWith('/') ? p : `/${p}`);
    try {
      const resp = await axios.post(url, payload, { headers, timeout: 12000, validateStatus: null });
      if (resp.status >= 200 && resp.status < 300) return { status: 'ok', source: url, data: resp.data };
      // if 403, try retry with api_key in query param (some gateways expect it there)
      if (resp.status === 403 && key) {
        try {
          const retryUrl = url + (url.includes('?') ? '&' : '?') + `api_key=${encodeURIComponent(key)}`;
          const r2 = await axios.post(retryUrl, payload, { headers, timeout: 12000, validateStatus: null });
          if (r2.status >= 200 && r2.status < 300) return { status: 'ok', source: retryUrl, data: r2.data };
          lastErr = r2;
          console.warn('navamsa retry non-2xx', retryUrl, r2.status, r2.data);
        } catch (err2) {
          lastErr = err2;
          if (err2 && err2.response) console.warn('navamsa retry failed', url, err2.response.status, err2.response.data);
          else console.warn('navamsa retry failed', url, err2 && err2.message);
        }
      } else {
        lastErr = resp;
        console.warn('navamsa candidate non-2xx', url, resp.status, resp.data);
      }
    } catch (err) {
      lastErr = err;
      if (err && err.response) console.warn('navamsa request failed', url, err.response.status, err.response.data);
      else console.warn('navamsa request failed', url, err && err.message);
    }
  }
  const e = new Error('provider_error');
  e.original = lastErr;
  throw e;
}

async function divisional(n, payloadOrProfile) {
  const num = parseInt(n, 10);
  if (!num || num < 2 || num > 60) {
    const err = new Error('invalid_divisional');
    err.code = 'invalid_divisional';
    throw err;
  }
  const configured = process.env.ASTRO_API_URL || 'https://json.freeastrologyapi.com';
  const key = process.env.ASTRO_API_KEY;
  const base = configured.replace(/\/$/, '');
  if (!configured) throw new Error('no_provider_configured');

  const headers = { 'Content-Type': 'application/json' };
  if (key) headers['x-api-key'] = key;
  if (process.env.ASTRO_API_TOKEN) headers['Authorization'] = `Bearer ${process.env.ASTRO_API_TOKEN}`;

  // build payload similar to navamsa/planets
  let payload = payloadOrProfile || {};
  if (payload && payload.profile) payload = payload.profile;
  const hasDob = !!(payload && payload.dob);
  const hasTime = !!(payload && (payload.timeOfBirth || payload.time));
  const hasPlace = !!(payload && (payload.placeOfBirth || payload.place));
  if (hasDob && hasPlace && (hasTime || payload.hours !== undefined)) {
    const [year, month, date] = (payload.dob || '').split('-').map(s => parseInt(s, 10));
    const timeStr = payload.timeOfBirth || payload.time || '00:00:00';
    const parts = ('' + timeStr).split(':').map(s => parseInt(s, 10));
    const hours = parts[0] || 0, minutes = parts[1] || 0, seconds = parts[2] || 0;
    const place = payload.placeOfBirth || payload.place || {};
    const latitude = (place && (place.lat || place.latitude)) || 0;
    const longitude = (place && (place.lng || place.lon || place.longitude)) || 0;
    const countryCode = (place && place.countryCode) || (place && place.country) || undefined;
    const timezone = parseFloat(process.env.ASTRO_DEFAULT_TIMEZONE || (countryCode === 'IN' ? '5.5' : '0'));
    payload = {
      year: year || new Date().getUTCFullYear(),
      month: month || (new Date().getUTCMonth() + 1),
      date: date || new Date().getUTCDate(),
      hours,
      minutes,
      seconds,
      latitude,
      longitude,
      timezone,
      settings: payload.settings || { observation_point: 'topocentric', ayanamsha: 'lahiri' }
    };
  }

  const candidates = [`/d${num}-chart-info`, `/v1/d${num}-chart-info`, `/d${num}`, `/v1/d${num}`];
  let lastErr = null;

  // Try the configured base, then fallback bases commonly used by providers
  const fallbackBases = [
    base,
    'https://json.freeastrologyapi.com',
    'https://json.apiastro.com'
  ].filter((b, idx, arr) => b && arr.indexOf(b) === idx);

  for (const host of fallbackBases) {
    for (const p of candidates) {
      const url = host + (p.startsWith('/') ? p : `/${p}`);
      try {
        const resp = await axios.post(url, payload, { headers, timeout: 12000, validateStatus: null });
        if (resp.status >= 200 && resp.status < 300) return { status: 'ok', source: url, data: resp.data };
        if (resp.status === 403 && key) {
          try {
            const retryUrl = url + (url.includes('?') ? '&' : '?') + `api_key=${encodeURIComponent(key)}`;
            const r2 = await axios.post(retryUrl, payload, { headers, timeout: 12000, validateStatus: null });
            if (r2.status >= 200 && r2.status < 300) return { status: 'ok', source: retryUrl, data: r2.data };
            lastErr = r2;
            console.warn('divisional retry non-2xx', retryUrl, r2.status, r2.data);
          } catch (err2) {
            lastErr = err2;
            if (err2 && err2.response) console.warn('divisional retry failed', url, err2.response.status, err2.response.data);
            else console.warn('divisional retry failed', url, err2 && err2.message);
          }
        } else {
          lastErr = resp;
          console.warn('divisional candidate non-2xx', url, resp.status, resp.data);
        }
      } catch (err) {
        lastErr = err;
        if (err && err.response) console.warn('divisional request failed', url, err.response.status, err.response.data);
        else console.warn('divisional request failed', url, err && err.message);
      }
    }
  }
  const e = new Error('provider_error');
  e.original = lastErr;
  throw e;
}

async function horoscopeSvg(payloadOrProfile) {
  const configured = process.env.ASTRO_API_URL || 'https://json.freeastrologyapi.com';
  const key = process.env.ASTRO_API_KEY;
  const base = configured.replace(/\/$/, '');
  if (!configured) throw new Error('no_provider_configured');

  const headers = { 'Content-Type': 'application/json' };
  if (key) headers['x-api-key'] = key;
  if (process.env.ASTRO_API_TOKEN) headers['Authorization'] = `Bearer ${process.env.ASTRO_API_TOKEN}`;

  let payload = payloadOrProfile || {};
  if (payload && payload.profile) payload = payload.profile;

  const candidates = ['/horoscope-chart-svg-code', '/v1/horoscope-chart-svg-code', '/horoscope-chart-svg', '/v1/horoscope-chart-svg'];
  let lastErr = null;
  for (const p of candidates) {
    const url = base + (p.startsWith('/') ? p : `/${p}`);
    try {
      const resp = await axios.post(url, payload, { headers, timeout: 12000, validateStatus: null });
      if (resp.status >= 200 && resp.status < 300) return { status: 'ok', source: url, data: resp.data };
      if (resp.status === 403 && key) {
        try {
          const retryUrl = url + (url.includes('?') ? '&' : '?') + `api_key=${encodeURIComponent(key)}`;
          const r2 = await axios.post(retryUrl, payload, { headers, timeout: 12000, validateStatus: null });
          if (r2.status >= 200 && r2.status < 300) return { status: 'ok', source: retryUrl, data: r2.data };
          lastErr = r2;
          console.warn('horoscopeSvg retry non-2xx', retryUrl, r2.status, r2.data);
        } catch (err2) {
          lastErr = err2;
          if (err2 && err2.response) console.warn('horoscopeSvg retry failed', url, err2.response.status, err2.response.data);
          else console.warn('horoscopeSvg retry failed', url, err2 && err2.message);
        }
      } else {
        lastErr = resp;
        console.warn('horoscopeSvg candidate non-2xx', url, resp.status, resp.data);
      }
    } catch (err) {
      lastErr = err;
      if (err && err.response) console.warn('horoscopeSvg request failed', url, err.response.status, err.response.data);
      else console.warn('horoscopeSvg request failed', url, err && err.message);
    }
  }

  const e = new Error('provider_error');
  e.original = lastErr;
  throw e;
}

// re-export updated API
module.exports = { compute, _cache: cache, geoDetails, planets, navamsa, divisional, horoscopeSvg };
