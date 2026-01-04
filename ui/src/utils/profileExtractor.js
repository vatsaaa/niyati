// Lightweight extractor that prefers wink-nlp + chrono-node when available,
// but falls back to deterministic regex heuristics when those libs are not
// installed or fail to load. This keeps the extractor robust for both
// dev environments and CI where optional model packages may not be present.

/**
 * Helper function to extract the actual place name from a phrase like
 * "capital city of India called New Delhi" -> "New Delhi"
 * Uses patterns like "called X", "named X", or falls back to last proper noun phrase
 */
function extractActualPlaceName(phrase) {
  if (!phrase) return '';
  
  // Pattern 1: "called X" or "named X" - extract what comes after
  const calledMatch = phrase.match(/(?:called|named|known as)\s+([A-Z][A-Za-z\s'-]+)/i);
  if (calledMatch) {
    return calledMatch[1].trim();
  }
  
  // Pattern 2: Look for proper noun at the end (capitalized words)
  // e.g., "capital city of India called New Delhi" -> "New Delhi"
  const properNounMatch = phrase.match(/([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,3})$/);
  if (properNounMatch) {
    const candidate = properNounMatch[1].trim();
    // Make sure it's not a common descriptor
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
 * Extract profile fields (name, dob, timeOfBirth, placeOfBirth) from natural language text.
 * Tries to dynamically load `chrono-node` and `wink-nlp` + model; otherwise uses
 * conservative regex-based heuristics (same API as before).
 * @param {string} text
 * @returns {Promise<Record<string,string>>}
 */
export async function extractProfileFields(text) {
  const result = {};
  if (!text || typeof text !== 'string') return result;
  const trimmed = text.trim();
  if (!trimmed) return result;

  // Try to load chrono and wink dynamically. These are optional — if they fail
  // we fall back to the project's existing regex heuristics.
  let chrono = null;
  let nlp = null;
  try {
    chrono = await import(/* @vite-ignore */ 'chrono-node');
  } catch (e) {
    chrono = null;
  }
    try {
    const wink = await import(/* @vite-ignore */ 'wink-nlp');
    try {
      const modelName = 'wink-eng-lite-model';
      const model = await import(/* @vite-ignore */ modelName);
      nlp = wink.default ? wink.default(model.default) : wink(model.default);
    } catch (mErr) {
      try {
        nlp = wink.default ? wink.default() : wink();
      } catch (err2) {
        nlp = null;
      }
    }
  } catch (e) {
    nlp = null;
  }

  // If chrono is available, extract date/time using it (robust parsing)
  if (chrono) {
    try {
      const chronoResults = chrono.parse(trimmed);
      if (Array.isArray(chronoResults) && chronoResults.length > 0) {
        const r = chronoResults[0];
        if (r && r.start) {
          const d = r.start.date();
          if (d instanceof Date && !Number.isNaN(d.getTime())) {
            const isoDate = d.toISOString().split('T')[0];
            const today = new Date().toISOString().split('T')[0];
            if (isoDate !== today) {
              const hasYear = !!r.start.get('year');
              if (hasYear) result.dob = isoDate;
            }

            // Only extract time if the user explicitly mentioned it
            // chrono defaults to 12:00 when no time is given, so we check isCertain('hour')
            const hourIsCertain = r.start.isCertain && r.start.isCertain('hour');
            if (hourIsCertain) {
              const hour = r.start.get('hour');
              const minute = r.start.get('minute');
              const second = r.start.get('second') || 0;
              if (typeof hour === 'number') {
                const hh = String(hour).padStart(2, '0');
                const mm = String(minute || 0).padStart(2, '0');
                const ss = String(second).padStart(2, '0');
                result.timeOfBirth = `${hh}:${mm}:${ss}`;
              }
            }
          }
        }
      }
    } catch (e) {
      // ignore chrono parse errors
    }
  }

  // If wink-nlp loaded successfully, use it for entity heuristics
  if (nlp) {
    try {
      const doc = nlp.readDoc(trimmed);

      // Name: direct phrase extraction first
      const namePhrase = trimmed.match(/(?:my name is|i am|i'm)\s+([^.,;\n]{2,80})/i);
      if (namePhrase) {
        const candidate = namePhrase[1].split(/[.,;\n]/)[0].trim();
        const match = candidate.match(/([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,3})/);
        if (match) result.name = match[1].trim();
      }
      
      // Fallback: If no "I am" prefix, check for comma-separated format starting with name
      // e.g., "Ankur Vatsa, 19 May 1979, 07:31 am, New Delhi"
      if (!result.name) {
        const commaParts = trimmed.split(',').map(p => p.trim());
        if (commaParts.length >= 2) {
          const firstPart = commaParts[0];
          // Check if first part is a name (capitalized words, no digits)
          const nameMatch = firstPart.match(/^([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,3})$/);
          if (nameMatch && !/\d/.test(firstPart)) {
            result.name = nameMatch[1];
          }
        }
      }

      // Entities: prefer PERSON and LOCATION-like entities where available
      if (!result.name) {
        try {
          const persons = doc.entities().filter((e) => {
            const t = String(e.out('type') || '').toLowerCase();
            return t === 'person' || t === 'person_name';
          });
          if (persons && persons.length > 0) result.name = persons[0].out('text');
        } catch (e) { /* fallthrough */ }
      }

      // Place extraction: PRIORITIZE wink-nlp entities first (GPE = Geo-Political Entity)
      // This is more accurate than regex for complex sentences
      try {
        const locs = doc.entities().filter((e) => {
          const t = String(e.out('type') || '').toLowerCase();
          return t === 'place' || t === 'location' || t === 'gpe';
        });
        if (locs && locs.length > 0) {
          // Prefer the last location entity (often the most specific, e.g., "New Delhi" after "India")
          const locTexts = locs.map(l => l.out('text'));
          // Filter out country names if we have a city
          const cities = locTexts.filter(l => !['india', 'usa', 'uk', 'australia', 'canada', 'england', 'america'].includes(l.toLowerCase()));
          result.placeOfBirth = cities.length > 0 ? cities[cities.length - 1] : locTexts[locTexts.length - 1];
        }
      } catch (e) { /* ignore */ }

      // Fallback: Check for comma-separated format (last part is often place)
      // e.g., "Ankur Vatsa, 19 May 1979, 07:31 am, New Delhi"
      if (!result.placeOfBirth) {
        const commaParts = trimmed.split(',').map(p => p.trim());
        if (commaParts.length >= 3) {
          const lastPart = commaParts[commaParts.length - 1];
          // Check if last part looks like a place (capitalized, no time/date patterns)
          if (/^[A-Z][A-Za-z\s'-]+$/.test(lastPart) && !/\d/.test(lastPart) && !/am|pm/i.test(lastPart)) {
            result.placeOfBirth = lastPart;
          }
        }
      }

      // Fallback: Use phrase patterns if still no place found
      if (!result.placeOfBirth) {
        // Pattern 1: "in PLACE" after time patterns (e.g., "at 07:31 am in New Delhi")
        const placeInPattern = trimmed.match(/(?:am|pm|AM|PM|\d{1,2}:\d{2})\s+in\s+([A-Za-z][A-Za-z\s,'-]{1,80}?)(?:\.|$|,|\s+and\s|\s+on\s)/i);
        if (placeInPattern) {
          let p = placeInPattern[1].trim();
          // Extract just the actual place name (last proper noun phrase)
          p = extractActualPlaceName(p);
          if (p.length > 1) result.placeOfBirth = p;
        }
      }
      
      // Pattern 2: Fallback to general "born in/at" pattern
      if (!result.placeOfBirth) {
        const placePhrase = trimmed.match(/(?:born\b[\s\S]{0,80}?\b(?:in|at)|from\b|place of birth(?: is| was)?|birthplace)\s+([^,\.\n]{2,120})/i);
        if (placePhrase) {
          let p = placePhrase[1].split(/[.,;\n]/)[0].trim();
          p = p.replace(/^(?:was|is|my|the|born in|born at|in|at)\b[:\s-]*/i, '').trim();
          p = p.replace(/^\d{1,2}:\d{2}(?::\d{2})?\s*(?:am|pm)?\s*(?:in\s+)?/i, '').trim();
          p = p.replace(/\s+(on|at)\s+\d.*$/i, '').trim();
          // Extract just the actual place name
          p = extractActualPlaceName(p);
          if (p.length > 1) result.placeOfBirth = p;
        }
      }

      return result;
    } catch (e) {
      // if wink processing fails, fall back to deterministic heuristics below
    }
  }

  // --- Fallback deterministic heuristics (previous implementation)

  // Name extraction (conservative)
  const nameMatch = trimmed.match(/(?:my name is|i am|i'm)\s+(?!from\b|in\b|born\b|at\b)([A-Z][a-z]+(?:\s+(?!and\b|from\b|in\b|at\b|born\b|i\b|was\b)[A-Z][a-z]+){0,3})/i);
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

  // Date of birth patterns (simple regexes)
  const toISO = (day, monthStr, year) => {
    const months = {
      jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
      jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
      january: '01', february: '02', march: '03', april: '04', june: '06',
      july: '07', august: '08', september: '09', october: '10', november: '11', december: '12'
    };
    const m = months[monthStr.toLowerCase().substring(0, 3)] || months[monthStr.toLowerCase()];
    if (!m) return null;
    return `${year}-${m}-${day.padStart(2, '0')}`;
  };

  const dobMatchISO = trimmed.match(/(\d{4}-\d{2}-\d{2})/);
  const dobMatchDMY = trimmed.match(/(\d{1,2}[\/\.-]\d{1,2}[\/\.-]\d{2,4})/);
  const dobMatchText = trimmed.match(/(\d{1,2})[\/\.-]\s*([A-Za-z]{3,9})[\/\.-]\s*(\d{2,4})/i);
  const dobMatchTextSpace = trimmed.match(/(\d{1,2})\s+([A-Za-z]{3,9})\s+(\d{2,4})/i);
  if (dobMatchISO) result.dob = dobMatchISO[1];
  else if (dobMatchDMY) result.dob = dobMatchDMY[1];
  else if (dobMatchText) result.dob = toISO(dobMatchText[1], dobMatchText[2], dobMatchText[3]) || dobMatchText[0];
  else if (dobMatchTextSpace) result.dob = toISO(dobMatchTextSpace[1], dobMatchTextSpace[2], dobMatchTextSpace[3]) || dobMatchTextSpace[0];

  // Time of birth patterns
  const timeMatchSecAmPm = trimmed.match(/(\d{1,2}:\d{2}:\d{2}\s*(?:am|pm))/i);
  const timeMatchSec24 = trimmed.match(/(\b\d{1,2}:\d{2}:\d{2}\b)/);
  const timeMatchMinAmPm = trimmed.match(/(\d{1,2}:\d{2}\s*(?:am|pm))/i);
  const timeMatchMin24 = trimmed.match(/(\b\d{1,2}:\d{2}\b)/);
  const timeMatchHourAmPm = trimmed.match(/(\b\d{1,2}\s*(?:am|pm)\b)/i);
  if (timeMatchSecAmPm) result.timeOfBirth = timeMatchSecAmPm[1].trim();
  else if (timeMatchSec24) result.timeOfBirth = timeMatchSec24[1].trim();
  else if (timeMatchMinAmPm) result.timeOfBirth = timeMatchMinAmPm[1].trim();
  else if (timeMatchMin24) result.timeOfBirth = timeMatchMin24[1].trim();
  else if (timeMatchHourAmPm) result.timeOfBirth = timeMatchHourAmPm[1].trim();

  // Place extraction (conservative)
  // First try to find "in PLACE" after a time pattern (e.g., "at 11:01 am in Abu Dhabi")
  const timeInPlaceRegex = /(?:am|pm|AM|PM|\d{1,2}:\d{2})\s+in\s+([A-Za-z][A-Za-z\s,'-]{1,80}?)(?:\.|$|,|\s+and\s|\s+on\s)/i;
  const timeInPlaceMatch = trimmed.match(timeInPlaceRegex);
  if (timeInPlaceMatch) {
    let p = timeInPlaceMatch[1].trim();
    // Use helper to extract actual place name from descriptive phrases
    p = extractActualPlaceName(p);
    if (p.length > 2) result.placeOfBirth = p;
  }
  
  // Fallback to general place pattern
  if (!result.placeOfBirth) {
    const placeRegex = /(?:born\b[\s\S]{0,120}?\b(?:in|at)|from\b|place of my birth(?: is| was)?|place of birth(?: is| was|[:\s]*)|my place of birth(?: is| was)?|birthplace(?: is| was|[:\s]*)|birth\s*place(?: is| was|[:\s]*)|my birth place(?: is| was)?)\s+([A-Za-z][A-Za-z0-9 ,.\-']{1,99})/i;
    const placeMatch = trimmed.match(placeRegex);
    if (placeMatch) {
      let p = placeMatch[1].trim();
      p = p.replace(/^(?:was|is|my|the|born in|born at|in|at)\b[:\s-]*/i, '').trim();
      // Remove any time patterns that might have been captured
      p = p.replace(/^\d{1,2}:\d{2}(?::\d{2})?\s*(?:am|pm)?\s*(?:in\s+)?/i, '').trim();
      const cutOff = p.search(/\s+(on|at)\s+\d/i);
      if (cutOff !== -1) p = p.substring(0, cutOff).trim();
      const monthCutOff = p.search(/\s+on\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i);
      if (monthCutOff !== -1) p = p.substring(0, monthCutOff).trim();
      // Use helper to extract actual place name from descriptive phrases
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
// end of extractor
