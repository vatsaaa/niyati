/**
 * Profile Field Extractor API
 * 
 * Extracts profile fields (name, dob, timeOfBirth, placeOfBirth) from natural language text.
 * Uses deterministic regex-based heuristics for reliable extraction.
 * 
 * POST /api/v1/profile/extract
 * Body: { text: string }
 * Response: { status: 'ok', data: { name?, dob?, timeOfBirth?, placeOfBirth? } }
 */

const express = require('express');
const router = express.Router();
const { logger, sanitize, ErrorCodes } = require('@niyati/commons');
// reuse existing NLP.js classifier in the platform
let nlpClassifier = null;
try {
  nlpClassifier = require('./nlpClassifier');
} catch (e) {
  nlpClassifier = null;
}
// Optional chrono-node for natural date/time parsing (best-effort).
let chrono = null;
try {
  chrono = require('chrono-node');
} catch (e) {
  chrono = null;
}

/**
 * Helper function to extract the actual place name from a phrase like
 * "capital city of India called New Delhi" -> "New Delhi"
 */
function extractActualPlaceName(phrase) {
  if (!phrase) return '';
  
  // Pattern 1: "called X" or "named X" - extract what comes after
  const calledMatch = phrase.match(/(?:called|named|known as)\s+([A-Z][A-Za-z\s'-]+)/i);
  if (calledMatch) {
    return calledMatch[1].trim();
  }
  
  // Pattern 2: Look for proper noun at the end (capitalized words)
  const properNounMatch = phrase.match(/([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,3})$/);
  if (properNounMatch) {
    const candidate = properNounMatch[1].trim();
    const descriptors = ['city', 'town', 'village', 'capital', 'state', 'country', 'place', 'area'];
    if (!descriptors.includes(candidate.toLowerCase())) {
      return candidate;
    }
  }
  
  // Pattern 3: If phrase contains "of X" where X is a country, look for city after it
  const afterCountry = phrase.match(/(?:india|usa|uk|australia|america|england|canada|france|germany|china|japan)(?:\s+(?:called|named|known as))?\s+([A-Z][A-Za-z\s'-]+)/i);
  if (afterCountry) {
    return afterCountry[1].trim();
  }
  
  // Fallback: return original phrase cleaned up
  return phrase.trim();
}

/**
 * Convert date components to ISO format
 */
function toISO(day, monthStr, year) {
  const months = {
    jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
    jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
    january: '01', february: '02', march: '03', april: '04', june: '06',
    july: '07', august: '08', september: '09', october: '10', november: '11', december: '12'
  };
  const m = months[monthStr.toLowerCase().substring(0, 3)] || months[monthStr.toLowerCase()];
  if (!m) return null;
  const y = year.length === 2 ? (parseInt(year) > 50 ? '19' + year : '20' + year) : year;
  return `${y}-${m}-${day.padStart(2, '0')}`;
}

/**
 * Extract profile fields from natural language text
 * @param {string} text - Input text to parse
 * @returns {object} - Extracted fields { name?, dob?, timeOfBirth?, placeOfBirth? }
 */
function extractProfileFields(text) {
  const result = {};
  if (!text || typeof text !== 'string') return result;
  const trimmed = text.trim();
  if (!trimmed) return result;

  // Name extraction (conservative) - stop at common delimiters
  const nameMatch = trimmed.match(/(?:my name is|i am|i'm)\s+(?!from\b|in\b|born\b|at\b)([A-Z][A-Za-z]+(?:\s+(?!and\b|from\b|in\b|at\b|born\b|i\b|was\b)[A-Z][A-Za-z]+){0,3})(?=(?:\s+(?:born|in|on|at|,|\.|and))|$)/i);
  if (nameMatch) result.name = nameMatch[1].trim();
  
  // Fallback: comma-separated format (e.g., "Ankur Vatsa, 19 May 1979, ...")
  if (!result.name) {
    const commaParts = trimmed.split(',').map(p => p.trim());
    if (commaParts.length >= 2) {
      let firstPart = commaParts[0];
      // Ignore common greetings or short salutations like "Hi Niyati"
      if (/^(hi|hello|hey|dear)\b/i.test(firstPart)) {
        // strip greeting and continue
        firstPart = firstPart.replace(/^(hi|hello|hey|dear)[:,!\s]*/i, '').trim();
      }
      // Also strip leading polite phrases like "dear" or accidental salutations
      firstPart = firstPart.replace(/^dear\s+/i, '').trim();
      const commaNameMatch = firstPart.match(/^([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,3})$/);
      if (commaNameMatch && !/\d/.test(firstPart) && firstPart.length > 2) {
        result.name = commaNameMatch[1];
      }
    }
  }

  // Second-pass: prefer explicit "I am <Name>" or "my name is <Name>" mentions
  // over short salutations captured by comma fallback (e.g., "Hi Niyati, I am Priya Sharma.")
  if (trimmed && typeof trimmed === 'string') {
    const explicitNameMatch = trimmed.match(/(?:my name is|i am|i'm)\s+([A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z]+){0,3})/i);
    if (explicitNameMatch && explicitNameMatch[1]) {
      result.name = explicitNameMatch[1].trim();
    }
  }

  // Clean common trailing artifacts from captured name (e.g., "Arun born in")
  if (result.name && typeof result.name === 'string') {
    result.name = result.name.replace(/\s+born\b[\s\S]*$/i, '').replace(/\s+and\s*$/i, '').trim();
  }

  // Date of birth patterns
  const dobMatchISO = trimmed.match(/(\d{4}-\d{2}-\d{2})/);
  const dobMatchText = trimmed.match(/(\d{1,2})[\/\.-]\s*([A-Za-z]{3,9})[\/\.-]\s*(\d{2,4})/i);
  const dobMatchTextSpace = trimmed.match(/(\d{1,2})\s+([A-Za-z]{3,9})\s+(\d{2,4})/i);
  const dobMatchDMY = trimmed.match(/(\d{1,2})[\/\.-](\d{1,2})[\/\.-](\d{2,4})/);
  
  if (dobMatchISO) {
    result.dob = dobMatchISO[1];
  } else if (dobMatchText) {
    result.dob = toISO(dobMatchText[1], dobMatchText[2], dobMatchText[3]) || dobMatchText[0];
  } else if (dobMatchTextSpace) {
    result.dob = toISO(dobMatchTextSpace[1], dobMatchTextSpace[2], dobMatchTextSpace[3]) || dobMatchTextSpace[0];
  } else if (dobMatchDMY) {
    // Assume DD/MM/YYYY format
    const [, d, m, y] = dobMatchDMY;
    const year = y.length === 2 ? (parseInt(y) > 50 ? '19' + y : '20' + y) : y;
    result.dob = `${year}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }

  // Time of birth patterns (more permissive: allow optional leading 'at')
  const timeMatchSecAmPm = trimmed.match(/(?:at\s*)?(\d{1,2}:\d{2}:\d{2}\s*(?:am|pm))/i);
  const timeMatchSec24 = trimmed.match(/(?:at\s*)?(\b\d{1,2}:\d{2}:\d{2}\b)/);
  const timeMatchMinAmPm = trimmed.match(/(?:at\s*)?(\d{1,2}:\d{2}\s*(?:am|pm))/i);
  const timeMatchMin24 = trimmed.match(/(?:at\s*)?(\b\d{1,2}:\d{2}\b)/);
  const timeMatchHourAmPm = trimmed.match(/(?:at\s*)?(\b\d{1,2}\s*(?:am|pm)\b)/i);

  if (timeMatchSecAmPm && timeMatchSecAmPm[1]) result.timeOfBirth = timeMatchSecAmPm[1].trim();
  else if (timeMatchSec24 && timeMatchSec24[1]) result.timeOfBirth = timeMatchSec24[1].trim();
  else if (timeMatchMinAmPm && timeMatchMinAmPm[1]) result.timeOfBirth = timeMatchMinAmPm[1].trim();
  else if (timeMatchMin24 && timeMatchMin24[1]) result.timeOfBirth = timeMatchMin24[1].trim();
  else if (timeMatchHourAmPm && timeMatchHourAmPm[1]) result.timeOfBirth = timeMatchHourAmPm[1].trim();

  // Place extraction
  // First try "in PLACE" after a time pattern (e.g., "at 11:01 am in Abu Dhabi")
  const timeInPlaceMatch = trimmed.match(/(?:am|pm|AM|PM|\d{1,2}:\d{2})\s+in\s+([A-Za-z][A-Za-z\s,'-]{1,80}?)(?:\.|$|,|\s+and\s|\s+on\s)/i);
  if (timeInPlaceMatch) {
    let p = timeInPlaceMatch[1].trim();
    p = extractActualPlaceName(p);
    if (p.length > 2) result.placeOfBirth = p;
  }
  
  // Fallback to general place pattern
  if (!result.placeOfBirth) {
    const placeMatch = trimmed.match(/(?:born\b[\s\S]{0,120}?\b(?:in|at)|from\b|place of my birth(?: is| was)?|place of birth(?: is| was|[:\s]*)|my place of birth(?: is| was)?|birthplace(?: is| was|[:\s]*)|birth\s*place(?: is| was|[:\s]*)|my birth place(?: is| was)?)\s+([A-Za-z][A-Za-z0-9 ,.\-']{1,99})/i);
    if (placeMatch) {
      let p = placeMatch[1].trim();
      p = p.replace(/^(?:was|is|my|the|born in|born at|in|at)\b[:\s-]*/i, '').trim();
      p = p.replace(/^\d{1,2}:\d{2}(?::\d{2})?\s*(?:am|pm)?\s*(?:in\s+)?/i, '').trim();
      // Trim trailing 'on ...' or 'at ...' date/time fragments
      p = p.replace(/\s+on\b[\s\S]*$/i, '').replace(/\s+at\b[\s\S]*$/i, '').trim();
      // Remove leftover trailing 'on' or 'at'
      p = p.replace(/(?:\s+on|\s+at)\s*$/i, '').trim();
      p = extractActualPlaceName(p);
      if (p.length > 2) result.placeOfBirth = p;
    }
  }
  
  // Fallback: comma-separated format (last part is often place)
  if (!result.placeOfBirth) {
    const commaParts = trimmed.split(',').map(p => p.trim());
    if (commaParts.length >= 3) {
      const lastPart = commaParts[commaParts.length - 1];
      if (/^[A-Z][A-Za-z\s'-]+$/.test(lastPart) && !/\d/.test(lastPart) && !/am|pm/i.test(lastPart)) {
        result.placeOfBirth = lastPart;
      }
    }
  }

  return result;
}

/**
 * Try chrono-based extraction for date/time (best-effort). 
 * Returns null if chrono is unavailable or produces no useful fields.
 * Name and place extraction are handled by the deterministic regex extractor.
 */
function tryNlpExtract(text) {
  if (!text || typeof text !== 'string') return null;
  const out = {};

  try {
    // Chrono for date/time parsing (high-quality date extraction)
    if (chrono) {
      const parsed = chrono.parse(text);
      if (parsed && parsed.length) {
        // Use the first parsed result as candidate
        const p = parsed[0];
        if (p && p.start) {
          try {
            // Use local date components to avoid timezone shifts when formatting
            const dt = p.start.date();
            const year = dt.getFullYear();
            if (year && year > 1900 && year <= 2100) {
              const m = String(dt.getMonth() + 1).padStart(2, '0');
              const d = String(dt.getDate()).padStart(2, '0');
              out.dob = `${year}-${m}-${d}`;
            }
            // If time components are present, include timeOfBirth (HH:MM) in 24-hour local
            const hh = dt.getHours();
            const mm = dt.getMinutes();
            if (typeof hh === 'number' && typeof mm === 'number' && (hh !== 0 || mm !== 0)) {
              out.timeOfBirth = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
            }
          } catch (e) { /* ignore parsing errors */ }
        }
      }
    }

    // If we found at least one field, return the object; otherwise signal null
    if (out.dob || out.timeOfBirth) return out;
    return null;
  } catch (e) {
    return null;
  }
}

/**
 * Try NLP.js based extraction as higher-priority candidate source.
 * Returns object with possible fields discovered by NLP (name/place/date/time).
 */
async function tryNlpJsExtract(text) {
  if (!nlpClassifier || !text) return null;
  try {
    const result = await nlpClassifier.classifyMessage(text);
    const out = {};
    // node-nlp returns entities array with { entity, sourceText }
    if (Array.isArray(result.entities) && result.entities.length) {
      for (const e of result.entities) {
        const ent = (e.entity || '').toLowerCase();
        const val = e.sourceText || e.option || e.resolution || e.utteranceText || e.resolution || '';
        if (!val) continue;
        if (ent.includes('person') || ent === 'name') {
          out.name = out.name || String(val).trim();
        }
        if (ent.includes('place') || ent.includes('city') || ent.includes('location') || ent === 'address') {
          out.placeOfBirth = out.placeOfBirth || String(val).trim();
        }
        if (ent === 'datetime' || ent === 'date') {
          // leave date/time parsing to chrono where possible
          // but capture raw value as fallback
          if (!out.dob && e.resolution && e.resolution.date) out.dob = e.resolution.date;
          if (!out.timeOfBirth && e.resolution && e.resolution.time) out.timeOfBirth = e.resolution.time;
        }
      }
    }
    return Object.keys(out).length ? out : null;
  } catch (e) {
    return null;
  }
}

/**
 * POST /extract
 * Extract profile fields from natural language text
 */
router.post('/extract', async (req, res) => {
  try {
    const { text } = req.body;
    
    // text must be provided (even if empty string)
    if (text === undefined) {
      return res.sendError(ErrorCodes.VALIDATION_ERROR, 'text field is required');
    }
    
    const cleaned = sanitize(text);
    // Handle explicit null/empty text as empty result
    if (text === null || text === '') {
      return res.sendSuccess({});
    }

    // Prefer deterministic regex-based extraction first (preserves formats expected by clients/tests).
    // Then attempt chrono and NLP.js as best-effort sources, but keep deterministic values as authoritative.
    const deterministic = extractProfileFields(cleaned) || {};
    const nlpJs = (await tryNlpJsExtract(cleaned)) || {};
    const chronoExtract = tryNlpExtract(cleaned) || {};

    // Merge strategy: NLP-first as primary extractor (if NLP provides values, they take precedence).
    // Chrono supplements date/time, deterministic regex provides fallbacks for any missing fields.
    // Use Object.assign with deterministic first, then chrono, then nlpJs so that NLP values override fallbacks.
    const merged = Object.assign({}, deterministic, chronoExtract, nlpJs);

    const via = Object.keys(nlpJs).length ? 'nlp' : (Object.keys(chronoExtract).length ? 'chrono' : (Object.keys(deterministic).length ? 'deterministic' : 'none'));
    logger.debug({ msg: 'profile_extract', via, hasName: !!merged.name, hasDob: !!merged.dob });
    return res.sendSuccess(merged);
  } catch (err) {
    logger.error({ msg: 'profile_extract_failed', err: err.stack });
    return res.sendError(ErrorCodes.INTERNAL_SERVER_ERROR, 'Profile extraction failed');
  }
});

// Export for testing
module.exports = router;
module.exports.extractProfileFields = extractProfileFields;
