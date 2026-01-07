// This file contains utility functions for formatting data for display in the UI.

import { normalizeDateString } from './normalizers';

/**
 * Formats a raw time string (HH:MM:SS or HH:MM) into a display-friendly HH:MM:SS AM/PM format.
 * @param {string} rawTime - The time string to format.
 * @returns {string|null} The formatted time string or null if the input is invalid.
 */
export function formatTimeForDisplay(rawTime) {
  if (!rawTime) return null;
  const t = rawTime.trim();
  // Expect HH:MM:SS or HH:MM
  const m = t.match(/^(\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (!m) return null;
  let h = parseInt(m[1], 10);
  const min = m[2];
  const sec = m[3] || '00';
  const ampm = h >= 12 ? 'PM' : 'AM';
  let dispH = h % 12;
  if (dispH === 0) dispH = 12;
  return `${String(dispH).padStart(2, '0')}:${min}:${sec} ${ampm}`;
}

/**
 * Formats an ISO-like date string (YYYY-MM-DD) to a display-friendly DD-MMM-YYYY format.
 * It can also handle other date formats by attempting to normalize them first.
 * @param {string} rawDob - The date string to format.
 * @param {string} countryHint - A country code (e.g., 'US') to help disambiguate ambiguous date formats like M/D/Y.
 * @returns {string|null} The formatted date string or null if the input is invalid.
 */
export function formatDobForDisplay(rawDob, countryHint = 'US') {
  if (!rawDob) return null;
  // If it's already ISO-like, use it; else try to normalize with hint
  let iso = null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(rawDob)) iso = rawDob;
  else iso = normalizeDateString(rawDob, countryHint);
  if (!iso) return null;
  const [y, m, d] = iso.split('-').map(part => parseInt(part, 10));
  if (!y || !m || !d) return null;
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${String(d).padStart(2, '0')}-${months[m - 1]}-${y}`;
}

/**
 * Formats a current location object or string into a display-friendly string.
 * @param {object|string} currentLocation - The location object or string.
 * @returns {string|null} The formatted location string or null if input is invalid.
 */
export function formatCurrentLocationForDisplay(currentLocation) {
  if (!currentLocation) return null;
  if (typeof currentLocation === 'string') return currentLocation;
  if (typeof currentLocation === 'object') {
    const parts = [];
    if (currentLocation.city) parts.push(currentLocation.city);
    if (currentLocation.state) parts.push(currentLocation.state);
    if (currentLocation.country) parts.push(currentLocation.country);
    return parts.join(', ') || null;
  }
  return null;
}

/**
 * Returns the best display string for a user's place of birth from a profile object.
 * Prefers the normalized `user_placeOfBirth`, falling back to a raw provider string.
 * @param {object} profileObj - The user profile object.
 * @returns {string} The displayable place string, or '—' if not available.
 */
export function getDisplayPlace(profileObj) {
  if (!profileObj) return '—';
  if (profileObj.user_placeOfBirth) return profileObj.user_placeOfBirth;
  const raw = profileObj.placeOfBirth_raw || profileObj.user_placeOfBirth || '';
  if (!raw) return '—';
  // If raw contains ASCII fragment separated by commas, prefer that
  const parts = raw.split(',').map(p => p.trim()).filter(Boolean);
  const ascii = parts.find(p => /[A-Za-z]/.test(p));
  if (ascii) return ascii;
  return raw;
}

/**
 * Formats a geocoding location object into a single, clean place string for display.
 * @param {object} location - The location object from the geocoding service.
 * @returns {string} A formatted place string (e.g., "City, State, Country").
 */
export function formatPlaceFromLocation(location) {
  if (!location) return '';

  const rawAddress = location.raw?.address || location.address || {};

  let city = location.city || location.town || location.village || location.name ||
    rawAddress.city || rawAddress.town || rawAddress.village || '';
  let state = rawAddress.state || location.state || location.region || '';
  let country = location.country || rawAddress.country || '';

  const hasNonAscii = (str) => /[^\u0000-\u007F]/.test(str || '');
  if (city && hasNonAscii(city) && location.display_name) {
    const parts = location.display_name.split(',').map(s => s.trim()).filter(Boolean);
    const asciiCity = parts.find(p => /^[A-Za-z\s]+$/.test(p));
    if (asciiCity) city = asciiCity;
  }

  if (!state && location.display_name) {
    const parts = location.display_name.split(',').map(s => s.trim()).filter(Boolean);
    const nonPostcodeParts = parts.filter(p => !/^\d+$/.test(p));
    if (nonPostcodeParts.length >= 3) {
      state = nonPostcodeParts[nonPostcodeParts.length - 2];
    } else if (nonPostcodeParts.length === 2) {
      state = '';
    }
  }

  const parts = [city, state, country].map(p => (p || '').trim()).filter(p => p.length > 0);
  const result = parts.length > 0 ? parts.join(', ') : (location.display_name || '');

  return result;
}
