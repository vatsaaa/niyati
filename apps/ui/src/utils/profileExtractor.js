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
        return json.data;
      }
    }
    // If BFF call failed, fall through to fallback
    console.warn('[profileExtractor] BFF call failed, using fallback');
  } catch (err) {
    console.warn('[profileExtractor] BFF call error, using fallback:', err.message);
  }

  // --- Fallback: Basic regex extraction when BFF is unavailable ---
  // This is a minimal version that handles the most common patterns
  
  // Name extraction
  const nameMatch = trimmed.match(/(?:my name is|i am|i'm)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,3})/i);
  if (nameMatch) result.name = nameMatch[1].trim();
  
  // Comma-separated format fallback for name
  if (!result.name) {
    const commaParts = trimmed.split(',').map(p => p.trim());
    if (commaParts.length >= 2) {
      const firstPart = commaParts[0];
      const commaNameMatch = firstPart.match(/^([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,3})$/);
      if (commaNameMatch && !/\d/.test(firstPart)) {
        result.name = commaNameMatch[1];
      }
    }
  }

  // Date of birth (ISO format)
  const dobMatchISO = trimmed.match(/(\d{4}-\d{2}-\d{2})/);
  if (dobMatchISO) result.dob = dobMatchISO[1];

  // Time of birth
  const timeMatch = trimmed.match(/(\d{1,2}:\d{2}(?::\d{2})?\s*(?:am|pm)?)/i);
  if (timeMatch) result.timeOfBirth = timeMatch[1].trim();

  // Place of birth
  const placeMatch = trimmed.match(/(?:born\s+in|from|place of birth)\s+([A-Za-z][A-Za-z\s'-]{2,50})/i);
  if (placeMatch) {
    let p = placeMatch[1].trim();
    // Remove trailing date/time patterns
    p = p.split(/\s+on\s+/i)[0].trim();
    if (p.length > 2) result.placeOfBirth = p;
  }

  return result;
}

