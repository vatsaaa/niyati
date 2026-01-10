import { bffFetchWithRetry } from './api';
import { simpleHash } from '../utils/hash';
import { CACHE_CONFIG } from '../config';

// Well-known cities/places that should not be disambiguated by user country
// These are unique enough that they don't need country context
const WELL_KNOWN_PLACES = new Set([
  'new delhi', 'delhi', 'mumbai', 'bombay', 'kolkata', 'calcutta', 'chennai', 'madras',
  'bangalore', 'bengaluru', 'hyderabad', 'pune', 'ahmedabad', 'jaipur', 'lucknow',
  'tokyo', 'kyoto', 'osaka', 'beijing', 'shanghai', 'hong kong', 'singapore',
  'london', 'paris', 'rome', 'berlin', 'madrid', 'barcelona', 'amsterdam', 'vienna',
  'sydney', 'melbourne', 'toronto', 'vancouver', 'montreal', 'dubai', 'abu dhabi',
  'moscow', 'cairo', 'cape town', 'johannesburg', 'rio de janeiro', 'sao paulo',
  'buenos aires', 'mexico city', 'bangkok', 'seoul', 'taipei', 'kuala lumpur',
  'jakarta', 'manila', 'hanoi', 'ho chi minh', 'kathmandu', 'colombo', 'dhaka',
  'karachi', 'lahore', 'islamabad', 'kabul', 'tehran', 'istanbul', 'ankara',
  'jerusalem', 'tel aviv', 'athens', 'lisbon', 'dublin', 'edinburgh', 'brussels',
  'zurich', 'geneva', 'oslo', 'stockholm', 'copenhagen', 'helsinki', 'warsaw', 'prague',
  'budapest', 'bucharest', 'kiev', 'minsk', 'riga', 'tallinn', 'vilnius'
]);

/**
 * Determines the appropriate geocoding API endpoint and payload based on the location string format.
 * @param {string} location - The location string (e.g., "City, State, Country").
 * @param {string|null} userCountryName - The user's country name to help disambiguate single-word locations.
 * @returns {object|null} An object with the endpoint and payload, or null if the location is invalid.
 */
export function determineGeocodingEndpoint(location, userCountryName = null) {
  if (!location) return null;

  const cleaned = location.trim();
  const parts = cleaned.split(/[,;|]/g).map(p => p.trim()).filter(p => p.length > 0);

  const hasStreetIndicators = /\b(\d+\s+\w+|road|street|avenue|lane|drive|blvd|ave|rd|st|ln|dr)\b/i.test(cleaned);

  if (hasStreetIndicators || parts.length >= 4) {
    return {
      endpoint: '/geocode/structured',
      payload: { street: parts[0] || '', city: parts[1] || '', state: parts[2] || '', country: parts[3] || '' }
    };
  } else if (parts.length === 3) {
    return { endpoint: '/geocode/search', payload: { q: cleaned, limit: 5 } };
  } else if (parts.length === 2) {
    return { endpoint: '/geocode', payload: { q: cleaned, limit: 5 } };
  } else {
    let queryString = cleaned;
    // Only append user country if:
    // 1. We have a user country
    // 2. It's a single-part location (no commas)
    // 3. It's NOT a well-known place that doesn't need disambiguation
    // 4. The location doesn't already include the country name
    const isWellKnown = WELL_KNOWN_PLACES.has(cleaned.toLowerCase());
    if (userCountryName && parts.length === 1 && !isWellKnown) {
      if (!cleaned.toLowerCase().includes(userCountryName.toLowerCase())) {
        queryString = `${cleaned}, ${userCountryName}`;
      }
    }
    return { endpoint: '/geocode', payload: { q: queryString, limit: 5 } };
  }
}

/**
 * Resolves a place name to a structured location object and timezone.
 * This function is now pure and returns data instead of causing side effects.
 * @param {string} placeOfBirth - The place name to resolve.
 * @param {Array} countries - The list of countries to help with disambiguation.
 * @returns {Promise<{location: object, timezone: number}>} An object containing the location and timezone.
 * @throws {Error} If geocoding fails or no location data is found.
 */
export async function resolveLocationAndTimezone(placeOfBirth, countries = []) {
  let userCountryName = null;
  try {
    const savedCountryCode = localStorage.getItem('niyati_country_code');
    if (savedCountryCode && countries) {
      const userCountry = countries.find(c => c.code === savedCountryCode);
      if (userCountry) userCountryName = userCountry.name;
    }
  } catch (e) { /* ignore */ }

  const normalized = (placeOfBirth || '').trim().toLowerCase();
  const GEOCODE_CACHE_VERSION = 'v3';
  const geoCacheKey = `geocode:${GEOCODE_CACHE_VERSION}:${userCountryName || 'unknown'}:${simpleHash(normalized)}`;

  try {
    const rawCached = localStorage.getItem(geoCacheKey);
    if (rawCached) {
      const parsed = JSON.parse(rawCached);
      const ageMs = Date.now() - (parsed.__ts || 0);
      const TTL = 1000 * 60 * 60 * 24 * CACHE_CONFIG.geocodeTtlDays;
      if (ageMs > 0 && ageMs < TTL && parsed.data) {
        return parsed.data;
      }
    }
  } catch (e) { /* ignore cache errors */ }

  const geocodingConfig = determineGeocodingEndpoint(placeOfBirth, userCountryName);
  if (!geocodingConfig) {
    throw new Error('Invalid location format');
  }

  const geocodeResponse = await bffFetchWithRetry(geocodingConfig.endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(geocodingConfig.payload)
  }, { retries: 3, baseDelayMs: 400 });

  if (!geocodeResponse.ok) {
    throw new Error(`Geocoding failed: ${geocodeResponse.status}`);
  }

  const geocodeData = await geocodeResponse.json();
  const actualData = geocodeData.data || geocodeData;

  let locationData = null;
  if (actualData.status === 'ok' && (actualData.place || actualData.location)) {
    locationData = actualData.place || actualData.location;
  } else if (actualData.status === 'ambiguous' && actualData.suggestions && actualData.suggestions.length > 0) {
    locationData = actualData.suggestions[0];
  }

  if (!locationData) {
    throw new Error('No location data found');
  }

  // Normalize location data
  const normalizeLocation = (loc) => {
    if (!loc || typeof loc !== 'object') return loc;
    const out = { ...loc };
    const countryCode = (loc.countryCode || loc.country_code || (loc.address && (loc.address.country_code || loc.address.countryCode)) || '').toString().toUpperCase();
    if (countryCode) {
      const mapped = (countries || []).find(c => (c.code || '').toString().toUpperCase() === countryCode);
      if (mapped && mapped.name) out.country = mapped.name;
    }
    const hasNonAscii = (str) => /[^\u0000-\u007F]/.test(str || '');
    if (out.city && hasNonAscii(out.city) && out.display_name && typeof out.display_name === 'string') {
      const parts = out.display_name.split(',').map(p => p.trim()).filter(Boolean);
      const asciiCandidate = parts.find(p => /[A-Za-z]/.test(p));
      if (asciiCandidate) out.city = asciiCandidate;
    }
    if ((!out.country || hasNonAscii(out.country)) && out.display_name) {
      const parts = out.display_name.split(',').map(p => p.trim()).filter(Boolean);
      const last = parts[parts.length - 1] || '';
      if (last && /[A-Za-z]/.test(last)) out.country = last;
    }
    return out;
  };

  locationData = normalizeLocation(locationData);

  const timezonePayload = { lat: locationData.lat, lon: locationData.lon };
  let timezone = 0;
  try {
    const timezoneResponse = await bffFetchWithRetry('/astrology/geo-details', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(timezonePayload)
    });
    if (timezoneResponse.ok) {
      const timezoneData = await timezoneResponse.json();
      if (timezoneData.status === 'ok' && timezoneData.data) {
        timezone = timezoneData.data.timezone || timezoneData.data.utc_offset || 0;
      }
    }
  } catch (tzError) {
    console.warn('Timezone lookup error:', tzError.message, '- using default timezone');
  }

  const result = { location: locationData, timezone };
  try {
    const cacheObj = { __ts: Date.now(), data: result };
    localStorage.setItem(geoCacheKey, JSON.stringify(cacheObj));
  } catch (e) { /* ignore */ }

  return result;
}
