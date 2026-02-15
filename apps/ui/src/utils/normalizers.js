// This file contains utility functions for normalizing data,
// such as converting various string formats into a canonical form.

import { parseNaturalTime } from './dateParser';

/**
 * Normalizes a time string from various formats (e.g., "5pm", "17:30") into a canonical HH:MM:SS format.
 * Uses regex for common cases and falls back to natural language parsing for more complex inputs.
 * @param {string} s - The time string to normalize.
 * @returns {string} The normalized time string in HH:MM:SS format, or an empty string if parsing fails.
 */
export function normalizeTimeString(s) {
  if (!s || typeof s !== 'string') return '';
  let t = s.trim();

  // Handle AM/PM with optional seconds: hh:mm:ss am/pm or hh:mm am/pm or hh am/pm
  const ampmMatch = t.match(/^(\d{1,2})(?::(\d{2}))?(?::(\d{2}))?\s*(am|pm)$/i);
  if (ampmMatch) {
    let h = parseInt(ampmMatch[1], 10);
    const m = ampmMatch[2] ? parseInt(ampmMatch[2], 10) : 0;
    const s = ampmMatch[3] ? parseInt(ampmMatch[3], 10) : 0;
    const ampm = ampmMatch[4].toLowerCase();
    if (ampm === 'pm' && h < 12) h += 12;
    if (ampm === 'am' && h === 12) h = 0;
    if (isNaN(h) || isNaN(m) || isNaN(s)) return '';
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  // Handle 24-hour hh:mm:ss or hh:mm
  const mmss = t.match(/^(\d{1,2}):(\d{2}):(\d{2})$/);
  if (mmss) {
    let h = parseInt(mmss[1], 10);
    let m = parseInt(mmss[2], 10);
    let s = parseInt(mmss[3], 10);
    if (h < 0 || h > 23 || m < 0 || m > 59 || s < 0 || s > 59) return '';
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  const mm = t.match(/^(\d{1,2}):(\d{2})$/);
  if (mm) {
    let h = parseInt(mm[1], 10);
    let m = parseInt(mm[2], 10);
    if (h < 0 || h > 23 || m < 0 || m > 59) return '';
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`;
  }
  // Plain hour like '7' -> 07:00:00
  const justH = t.match(/^(\d{1,2})$/);
  if (justH) {
    let h = parseInt(justH[1], 10);
    if (h >= 0 && h <= 23) return `${String(h).padStart(2, '0')}:00:00`;
  }

  // Final fallback: try Chrono with lower confidence threshold
  try {
    const chronoResult = parseNaturalTime(t);
    if (chronoResult && chronoResult.confidence > 0.5) {
      console.debug('Using Chrono time result with confidence:', chronoResult.confidence);
      return chronoResult.time;
    }
  } catch (e) {
    // ignore
  }

  return '';
}

/**
 * Normalizes a date string from various formats into a canonical YYYY-MM-DD format.
 * Handles ISO format, "DD Month YYYY", and numeric formats like D/M/Y or M/D/Y.
 * @param {string} s - The date string to normalize.
 * @param {string} countryHint - A country code (e.g., 'US') to help disambiguate M/D/Y vs D/M/Y.
 * @returns {string|null} The normalized date string in YYYY-MM-DD format, or null if parsing fails.
 */
export function normalizeDateString(s, countryHint = 'US') {
  if (!s || typeof s !== 'string') return null;
  s = s.trim();

  // YYYY-MM-DD already
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return s;

  // Explicitly handle "DD Month YYYY" (e.g. 19 May 1979, 19-May-1979)
  const textSpace = s.match(/^(\d{1,2})[\s\-]+([A-Za-z]{3,9})[\s\-]+(\d{4})$/);
  if (textSpace) {
    const months = { jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06', jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12' };
    const mStr = textSpace[2].toLowerCase().substring(0, 3);
    const m = months[mStr];
    if (m) return `${textSpace[3]}-${m}-${textSpace[1].padStart(2, '0')}`;
  }

  // Try textual parse (e.g., '12 Jan 1990' or 'Jan 12 1990')
  const textDate = Date.parse(s);
  if (!isNaN(textDate)) {
    const dt = new Date(textDate);
    return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
  }

  // Numeric forms: D/M/Y or M/D/Y
  const dmy = s.match(/^(\d{1,2})[\/\.-](\d{1,2})[\/\.-](\d{2,4})$/);
  if (dmy) {
    let p1 = parseInt(dmy[1], 10);
    let p2 = parseInt(dmy[2], 10);
    let p3 = dmy[3];
    if (p3.length === 2) {
      p3 = parseInt(p3, 10) > 30 ? '19' + p3 : '20' + p3;
    }
    let day, month;
    // If country is US, assume MM/DD/YYYY, otherwise DD/MM/YYYY
    if (countryHint && countryHint.toUpperCase() === 'US') {
      month = String(p1).padStart(2, '0');
      day = String(p2).padStart(2, '0');
    } else {
      day = String(p1).padStart(2, '0');
      month = String(p2).padStart(2, '0');
    }
    const year = String(p3);
    // Basic validation
    if (parseInt(month, 10) < 1 || parseInt(month, 10) > 12) return null;
    if (parseInt(day, 10) < 1 || parseInt(day, 10) > 31) return null;
    return `${year}-${month}-${day}`;
  }

  return null;
}

/**
 * Validates a normalized YYYY-MM-DD date string for date-of-birth purposes.
 * Checks: (1) valid calendar date, (2) not in the future.
 * Returns { valid: true } if OK (or null/empty), or { valid: false, message } with a user-facing error.
 * @param {string|null} dateStr - The date string in YYYY-MM-DD format.
 * @returns {{ valid: boolean, message?: string }}
 */
export function validateNormalizedDate(dateStr) {
  if (!dateStr) return { valid: true };
  const match = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return { valid: false, message: `The date "${dateStr}" doesn't appear to be valid. Please use a format like "19 May 1979" or "1979-05-19".` };
  const year = parseInt(match[1], 10);
  const month = parseInt(match[2], 10);
  const day = parseInt(match[3], 10);
  const d = new Date(year, month - 1, day);
  if (d.getFullYear() !== year || d.getMonth() !== month - 1 || d.getDate() !== day) {
    return { valid: false, message: `The date "${dateStr}" doesn't exist. Could you double-check your date of birth?` };
  }
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (d > today) {
    return { valid: false, message: `The date you provided (${dateStr}) is in the future. Please share your actual date of birth.` };
  }
  return { valid: true };
}
