// Profile field extractor - thin client that calls BFF for NLP processing
// This keeps the UI lightweight as per project architecture principles.

import { bffFetchWithRetry } from '../services/api';

/**
 * Extract profile fields (name, dob, timeOfBirth, placeOfBirth) from natural language text.
 * Calls the BFF /api/v1/profile/extract endpoint which handles NLP processing server-side.
 * Falls back to basic regex extraction if BFF is unavailable.
 * @param {string} text
 * @returns {Promise<Record<string,string>>}
 */
export async function extractProfileFields(text) {
  const result = {};
  if (!text || typeof text !== 'string') return result;
  const trimmed = text.trim();
  // Debug: log extractor input for troubleshooting in the browser console
  try { console.debug && console.debug('[profileExtractor][debug] input:', trimmed); } catch (e) {}
  // Also persist last input to localStorage for easier debugging
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem('profileExtractor_debug', JSON.stringify({ phase: 'input', ts: new Date().toISOString(), value: trimmed }));
    }
  } catch (e) {}
  if (!trimmed) return result;

  try {
    const res = await bffFetchWithRetry('/profile/extract', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: trimmed })
    }, { retries: 1 }); // Single retry for extraction
    
    if (res.ok) {
      const json = await res.json();
      if (json.status === 'ok' && json.data) {
        try { console.debug && console.debug('[profileExtractor][debug] bff output:', json.data); } catch (e) {}
        try {
          if (typeof window !== 'undefined' && window.localStorage) {
            window.localStorage.setItem('profileExtractor_debug', JSON.stringify({ phase: 'bff', ts: new Date().toISOString(), value: json.data }));
          }
        } catch (e) {}
        return json.data;
      }
    }
    // If BFF call failed, fall through to fallback
    console.warn('[profileExtractor] BFF call failed, using fallback');
  } catch (err) {
    console.warn('[profileExtractor] BFF call error, using fallback:', err.message);
  }

  // No client-side fallback: UI delegates all extraction to the BFF.
  // If the BFF is unavailable, return an empty result so the UI can continue gracefully.
  try { console.debug && console.debug('[profileExtractor][debug] falling back to empty result (bff unavailable)'); } catch (e) {}
  return result;
}

