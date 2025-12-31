import { bffFetchWithRetry, sendClientLog } from './api';
import { resolveLocationAndTimezone } from './geo';
import { simpleHash } from '../utils/hash';
import { CACHE_CONFIG } from '../config';
import { buildApiUrl } from '../config';
import { formatCurrentLocationForDisplay } from '../utils/formatters';

/**
 * Calculates astrology data (planets and horoscope SVG) for a given profile.
 * This function is now pure and returns data instead of causing side effects.
 * @param {object} profile - The user's profile.
 * @param {object} locationData - The location data from the geocoding service.
 * @param {number} timezone - The timezone offset.
 * @returns {Promise<object>} An object containing the astrology results.
 * @throws {Error} If the astrology calculations fail.
 */
export async function calculateAstrology(profile, locationData, timezone) {
  const profileKey = JSON.stringify({
    name: profile.user_name,
    dob: profile.user_dob,
    place: profile.user_placeOfBirth,
    tob: profile.user_timeOfBirth,
  });
  const astroCacheKey = `astrology:${simpleHash(profileKey)}`;

  try {
    const raw = localStorage.getItem(astroCacheKey);
    if (raw) {
      const parsed = JSON.parse(raw);
      const age = Date.now() - (parsed.__ts || 0);
      const TTL = 1000 * 60 * 60 * 24 * CACHE_CONFIG.astrologyTtlDays;
      if (age > 0 && age < TTL && parsed.results) {
        return parsed.results;
      }
    }
  } catch (e) {
    // ignore cache errors
  }

  const [year, month, date] = profile.user_dob.split('-').map((n) => parseInt(n, 10));
  const timeParts = (profile.user_timeOfBirth || '00:00:00').split(':').map((n) => parseInt(n, 10));
  const [hours, minutes, seconds] = [timeParts[0] || 0, timeParts[1] || 0, timeParts[2] || 0];

  const astrologyPayload = {
    year,
    month,
    date,
    hours,
    minutes,
    seconds,
    latitude: locationData.lat,
    longitude: locationData.lon,
    timezone,
    settings: {
      observation_point: 'topocentric',
      ayanamsha: 'lahiri',
      language: 'en',
    },
  };

  const results = {};

  const planetsResponse = await bffFetchWithRetry('/astrology/planets', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(astrologyPayload),
  });

  if (planetsResponse.ok) {
    results.planets = await planetsResponse.json();
    await new Promise((r) => setTimeout(r, 1000));

    const horoscopeResponse = await bffFetchWithRetry('/astrology/horoscope-svg', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...astrologyPayload,
        config: astrologyPayload.settings,
      }),
    });

    if (horoscopeResponse.ok) {
      results.horoscopeSvg = await horoscopeResponse.text();
    } else {
      throw new Error(`Horoscope SVG API failed: ${horoscopeResponse.status}`);
    }
  } else {
    throw new Error(`Planets API failed: ${planetsResponse.status}`);
  }

  try {
    const cacheObj = { __ts: Date.now(), results };
    localStorage.setItem(astroCacheKey, JSON.stringify(cacheObj));
  } catch (e) {
    // ignore
  }

  return results;
}

/**
 * Processes a complete user profile to generate astrology calculations.
 * This function is now pure and returns data instead of causing side effects.
 * @param {object} profile - The user's profile.
 * @param {Array} countries - The list of countries to help with disambiguation.
 * @param {string} phoneNumber - The user's phone number.
 * @returns {Promise<object>} An object containing the astrology results.
 * @throws {Error} If the profile processing fails.
 */
export async function processCompleteProfile(profile, countries, phoneNumber) {
  const { location, timezone } = await resolveLocationAndTimezone(profile.user_placeOfBirth, countries);

  const persistPayload = {
    phoneNumber,
    dateOfBirth: profile.user_dob,
    timeOfBirth: profile.user_timeOfBirth,
    placeOfBirth: profile.user_placeOfBirth,
    lat: location && (location.lat || location.latitude),
    lon: location && (location.lon || location.longitude),
    timezone: timezone,
    consentGiven: profile.user_consentGiven,
    isPaid: !!profile.user_isPaid,
    // Use current location, not birth place location
    last_login_location: profile.user_currentLocation || '',
  };

  if (persistPayload.phoneNumber) {
    await bffFetchWithRetry('/users/profile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(persistPayload),
    });
  }

  const astrologyResults = await calculateAstrology(profile, location, timezone);

  const cacheKey = `astrology_${phoneNumber}_${Date.now()}`;
  try {
    localStorage.setItem(
      cacheKey,
      JSON.stringify({
        profile,
        location,
        timezone,
        results: astrologyResults,
        calculatedAt: new Date().toISOString(),
      })
    );
  } catch (e) {
    console.warn('Failed to cache astrology results:', e);
  }

  return astrologyResults;
}
