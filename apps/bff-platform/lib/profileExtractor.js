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
// Optional NLP libraries (best-effort). We will try NLP first and fall back
// to deterministic regex heuristics if NLP is unavailable or fails.
let winkNLP = null;
let winkModel = null;
let nlp = null;
let chrono = null;
try {
  winkNLP = require('wink-nlp');
  winkModel = require('wink-eng-lite-web-model');
  nlp = winkNLP(winkModel);
} catch (e) {
  nlp = null;
}
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
      const firstPart = commaParts[0];
      const commaNameMatch = firstPart.match(/^([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,3})$/);
      if (commaNameMatch && !/\d/.test(firstPart)) {
        result.name = commaNameMatch[1];
      }
    }
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
 * Try NLP-based extraction first (best-effort). Returns null if NLP is unavailable
 * or produces no useful fields so the deterministic extractor can be used.
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
            const dt = p.start.date();
            // If the parsed date looks like a full DOB (year present) capture it
            const year = dt.getUTCFullYear();
            if (year && year > 1900 && year <= 2100) {
              out.dob = dt.toISOString().slice(0, 10);
            }
            // If time components are present, include timeOfBirth (HH:MM[:SS])
            const hh = dt.getUTCHours();
            const mm = dt.getUTCMinutes();
            if (typeof hh === 'number' && typeof mm === 'number' && (hh !== 0 || mm !== 0)) {
              out.timeOfBirth = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
            }
          } catch (e) {}
        }
      }
    }

    // wink-nlp for named-entity like extraction (person/place)
    if (nlp) {
      const doc = nlp.readDoc(text);
      // Try to extract PERSON-like entities
      try {
        const ents = doc.entities().items ? doc.entities().items() : null;
        if (ents && Array.isArray(ents)) {
          for (const it of ents) {
            try {
              const type = (typeof it.type === 'function') ? it.type() : (it.type || '');
              const val = (typeof it.out === 'function') ? it.out() : (it.text || '');
              if (!val) continue;
              if (!out.name && String(type).toUpperCase() === 'PERSON') out.name = val;
              if (!out.placeOfBirth && (String(type).toUpperCase() === 'GPE' || String(type).toUpperCase() === 'LOC' || String(type).toUpperCase() === 'LOCATION')) {
                out.placeOfBirth = val;
              }
            } catch (e) {
              // ignore per-entity errors
            }
          }
        } else {
          // Fallback: use entity text array if available
          try {
            const entTexts = doc.entities().out();
            if (Array.isArray(entTexts) && entTexts.length) {
              // Heuristic: first multi-word capitalized entity -> name, last entity -> place
              for (const et of entTexts) {
                if (!out.name && /^[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+$/.test(et)) {
                  out.name = et;
                  break;
                }
              }
              if (!out.placeOfBirth && entTexts.length > 0) {
                const candidate = entTexts[entTexts.length - 1];
                if (/^[A-Z]/.test(candidate)) out.placeOfBirth = candidate;
              }
            }
          } catch (e) {}
        }
      } catch (e) {
        // ignore NLP extraction errors
      }
    }

    // If we found at least one field, return the object; otherwise signal null
    if (out.name || out.dob || out.timeOfBirth || out.placeOfBirth) return out;
    return null;
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
    // Prefer deterministic regex-based extraction first (preserves formats expected by clients/tests).
    // Then merge any missing fields from the NLP-based extractor as a best-effort enhancement.
    const deterministic = extractProfileFields(cleaned) || {};
    const nlpExtract = tryNlpExtract(cleaned) || {};

    // Merge: keep deterministic values when present; fill missing ones from NLP output.
    const merged = Object.assign({}, nlpExtract, deterministic);

    logger.debug({ msg: 'profile_extract', via: (Object.keys(deterministic).length ? 'deterministic' : (Object.keys(nlpExtract).length ? 'nlp' : 'none')), hasName: !!merged.name, hasDob: !!merged.dob });
    return res.sendSuccess(merged);
  } catch (err) {
    logger.error({ msg: 'profile_extract_failed', err: err.stack });
    return res.sendError(ErrorCodes.INTERNAL_SERVER_ERROR, 'Profile extraction failed');
  }
});

// Export for testing
module.exports = router;
module.exports.extractProfileFields = extractProfileFields;
