import { parseNaturalDate, parseNaturalTime } from './dateParser';

/**
 * Extract profile fields (name, dob, timeOfBirth, placeOfBirth) from natural language text.
 * 
 * @param {string} text - User input text
 * @returns {Promise<Object>} extracted fields
 */
export async function extractProfileFields(text) {
    let cleanedText = text; // We will remove extracted parts to avoid re-capturing them
    const result = {};

    // Name patterns
    // Exclude "from", "in", "at", "born" to avoid matching "I am from London" as name "From London"
    const nameMatch = text.match(/(?:my name is|i am|i'm)\s+(?!from\b|in\b|born\b|at\b)([A-Z][a-z]+(?:\s+(?!and\b|from\b|in\b|at\b|born\b|i\b|was\b)[A-Z][a-z]+){0,3})/i);
    if (nameMatch) {
        result.name = nameMatch[1].trim();
        cleanedText = cleanedText.replace(nameMatch[0], ' '); // Remove name part
    }

    // Helper to normalize DD MMM YYYY match to YYYY-MM-DD
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

    // DoB patterns (YYYY-MM-DD, DD/MM/YYYY, MM/DD/YYYY, 12th Jan 1990, or '11 November 2005')
    const dobMatchISO = text.match(/(\d{4}-\d{2}-\d{2})/);
    const dobMatchDMY = text.match(/(\d{1,2}[\/\.-]\d{1,2}[\/\.-]\d{2,4})/);
    // Matches things like '12-Jan-1990' or '12 Jan 1990' (with separators or spaces)
    const dobMatchText = text.match(/(\d{1,2})[\/\.-]\s*([A-Za-z]{3,9})[\/\.-]\s*(\d{2,4})/i);
    const dobMatchTextSpace = text.match(/(\d{1,2})\s+([A-Za-z]{3,9})\s+(\d{2,4})/i);

    let dobMatch = null;
    if (dobMatchISO) { result.dob = dobMatchISO[1]; dobMatch = dobMatchISO; }
    else if (dobMatchDMY) { result.dob = dobMatchDMY[1]; dobMatch = dobMatchDMY; }
    else if (dobMatchText) { result.dob = toISO(dobMatchText[1], dobMatchText[2], dobMatchText[3]) || dobMatchText[0]; dobMatch = dobMatchText; }
    else if (dobMatchTextSpace) { result.dob = toISO(dobMatchTextSpace[1], dobMatchTextSpace[2], dobMatchTextSpace[3]) || dobMatchTextSpace[0]; dobMatch = dobMatchTextSpace; }
    else {
        // Try natural language parsing for formats like "the fifteenth of March, 1990"
        // BUT skip if input looks like just a time (to avoid extracting today's date)
        const looksLikeTimeOnly = /^\s*(I was born at|born at|at)?\s*\d{1,2}(:\d{2})?\s*(am|pm|AM|PM)?\s*$/i.test(text);
        const hasDateKeywords = /\b(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|oct|nov|dec|\d{4})\b/i.test(text);

        if (!looksLikeTimeOnly && hasDateKeywords) {
            try {
                const chronoResult = await parseNaturalDate(text);
                if (chronoResult && chronoResult.confidence > 0.6) {
                    // Validate: don't accept today's date as DOB (likely a false positive)
                    const today = new Date().toISOString().split('T')[0];
                    if (chronoResult.date !== today) {
                        // console.log('Extracted date using Chrono:', chronoResult);
                        result.dob = chronoResult.date; // Already in YYYY-MM-DD format
                        // Note: Chrono doesn't give us the exact matched string span easily here without more work, 
                        // so we might still have the date text in cleanedText. 
                        // We'll rely on the place regex stopping at " on \d" etc.
                    } else {
                        // console.log('Chrono extracted today\'s date - ignoring as likely false positive');
                    }
                }
            } catch (e) {
                // console.debug('Chrono date extraction failed:', e);
            }
        }
    }

    if (dobMatch) {
        cleanedText = cleanedText.replace(dobMatch[0], ' ');
        // Also remove preceding "on" matches to clean up for place extraction "born in X on Y" -> "born in X"
        cleanedText = cleanedText.replace(/\s+on\s+$/, '');
    }

    // Time of birth patterns (e.g., 7:30 PM, 19:30, 7 pm, 11:00:04 am)
    const timeMatchSecAmPm = text.match(/(\d{1,2}:\d{2}:\d{2}\s*(?:am|pm))/i);
    const timeMatchSec24 = text.match(/(\b\d{1,2}:\d{2}:\d{2}\b)/);
    const timeMatchMinAmPm = text.match(/(\d{1,2}:\d{2}\s*(?:am|pm))/i);
    const timeMatchMin24 = text.match(/(\b\d{1,2}:\d{2}\b)/);
    const timeMatchHourAmPm = text.match(/(\b\d{1,2}\s*(?:am|pm)\b)/i);

    let timeMatch = null;
    if (timeMatchSecAmPm) { result.timeOfBirth = timeMatchSecAmPm[1].trim(); timeMatch = timeMatchSecAmPm; }
    else if (timeMatchSec24) { result.timeOfBirth = timeMatchSec24[1].trim(); timeMatch = timeMatchSec24; }
    else if (timeMatchMinAmPm) { result.timeOfBirth = timeMatchMinAmPm[1].trim(); timeMatch = timeMatchMinAmPm; }
    else if (timeMatchMin24) { result.timeOfBirth = timeMatchMin24[1].trim(); timeMatch = timeMatchMin24; }
    else if (timeMatchHourAmPm) { result.timeOfBirth = timeMatchHourAmPm[1].trim(); timeMatch = timeMatchHourAmPm; }
    else {
        // Try natural language parsing for formats like "half past two in the afternoon"
        // BUT only if we didn't already extract a date from the same text
        const hasTimeKeywords = /\b(at|around|approximately|about|AM|PM|a\.m\.|p\.m\.|o'clock|morning|afternoon|evening|night|noon|midnight)\b/i.test(text);

        if (!result.dob && hasTimeKeywords) {
            try {
                const chronoResult = await parseNaturalTime(text);
                if (chronoResult && chronoResult.confidence > 0.6) {
                    // console.log('Extracted time using Chrono:', chronoResult);
                    result.timeOfBirth = chronoResult.time; // Already in HH:MM:SS format
                }
            } catch (e) {
                // console.debug('Chrono time extraction failed:', e);
            }
        }
    }

    if (timeMatch) {
        cleanedText = cleanedText.replace(timeMatch[0], ' ');
        // Remove preceding "at"
        cleanedText = cleanedText.replace(/\s+at\s+$/, '');
    }

    // Place of birth patterns
    // Now running on cleanedText which has Date/Time removed (mostly).
    // We also reject matches that look like "on <date>" or "at <time>" leftovers.
    // Match common variants: "born in", "born at", "from", etc.
    // Update: Allow "born on ... in" pattern (where ... is likely the removed date space)
    // Matches: "born in", "born on in", "born at", "born on at", "from"
    const placeRegex = /(?:born\s+(?:on\s+)?(?:in|at)|from|place of my birth(?: is| was)?|place of birth(?: is| was|[:\s]*)|my place of birth(?: is| was)?|birthplace(?: is| was|[:\s]*)|birth\s*place(?: is| was|[:\s]*)|my birth place(?: is| was)?)\s+([A-Za-z][A-Za-z0-9 ,.\-']{1,99})/i;

    const placeMatch = cleanedText.match(placeRegex);
    if (placeMatch) {
        // Trim and defensively strip common leading verbs/articles
        let p = placeMatch[1].trim();
        p = p.replace(/^(?:was|is|my|the|born in|born at|in|at)\b[:\s-]*/i, '').trim();

        // Additional safety: truncate if we see " on " or " at " followed by numbers, just in case cleaning missed it.
        // e.g., if date was "19 May" but regex didn't catch it, and text is "New Delhi on 19 May"
        const cutOff = p.search(/\s+(on|at)\s+\d/i);
        if (cutOff !== -1) {
            p = p.substring(0, cutOff).trim();
        }
        // Also cut off if we see " on <MonthName>"
        const monthCutOff = p.search(/\s+on\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i);
        if (monthCutOff !== -1) {
            p = p.substring(0, monthCutOff).trim();
        }

        // If what remains is valid, use it
        if (p.length > 2) {
            result.placeOfBirth = p;
        }
    }

    return result;
}
