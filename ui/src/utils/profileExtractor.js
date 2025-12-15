// Lightweight extractor that prefers wink-nlp + chrono-node when available,
// but falls back to deterministic regex heuristics when those libs are not
// installed or fail to load. This keeps the extractor robust for both
// dev environments and CI where optional model packages may not be present.

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
    chrono = await import('chrono-node');
  } catch (e) {
    chrono = null;
  }
    try {
    const wink = await import('wink-nlp');
    try {
      const modelName = 'wink-eng-lite-model';
      const model = await import(modelName);
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

      // Place extraction via phrase patterns first
      const placePhrase = trimmed.match(/(?:born\b[\s\S]{0,80}?\b(?:in|at)|from\b|place of birth(?: is| was)?|birthplace)\s+([^,\.\n]{2,120})/i);
      if (placePhrase) {
        let p = placePhrase[1].split(/[.,;\n]/)[0].trim();
        p = p.replace(/^(?:was|is|my|the|born in|born at|in|at)\b[:\s-]*/i, '').trim();
        p = p.replace(/\s+(on|at)\s+\d.*$/i, '').trim();
        if (p.length > 1) result.placeOfBirth = p;
      }

      if (!result.placeOfBirth) {
        try {
          const locs = doc.entities().filter((e) => {
            const t = String(e.out('type') || '').toLowerCase();
            return t === 'place' || t === 'location' || t === 'gpe' || t === 'organization';
          });
          if (locs && locs.length > 0) result.placeOfBirth = locs[0].out('text');
        } catch (e) { /* ignore */ }
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
  const placeRegex = /(?:born\b[\s\S]{0,120}?\b(?:in|at)|from\b|place of my birth(?: is| was)?|place of birth(?: is| was|[:\s]*)|my place of birth(?: is| was)?|birthplace(?: is| was|[:\s]*)|birth\s*place(?: is| was|[:\s]*)|my birth place(?: is| was)?)\s+([A-Za-z][A-Za-z0-9 ,.\-']{1,99})/i;
  const placeMatch = trimmed.match(placeRegex);
  if (placeMatch) {
    let p = placeMatch[1].trim();
    p = p.replace(/^(?:was|is|my|the|born in|born at|in|at)\b[:\s-]*/i, '').trim();
    const cutOff = p.search(/\s+(on|at)\s+\d/i);
    if (cutOff !== -1) p = p.substring(0, cutOff).trim();
    const monthCutOff = p.search(/\s+on\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i);
    if (monthCutOff !== -1) p = p.substring(0, monthCutOff).trim();
    if (p.length > 2) result.placeOfBirth = p;
  }

  return result;
}
// end of extractor
