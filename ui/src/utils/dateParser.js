/**
 * Natural language date/time parser using Chrono
 * Provides robust parsing of dates and times from conversational text
 */

import * as chrono from 'chrono-node';

/**
 * Convert written numbers to digits for dates (e.g., "nineteen" -> "19")
 */
const numberWords = {
  'first': '1', 'second': '2', 'third': '3', 'fourth': '4', 'fifth': '5',
  'sixth': '6', 'seventh': '7', 'eighth': '8', 'ninth': '9', 'tenth': '10',
  'eleventh': '11', 'twelfth': '12', 'thirteenth': '13', 'fourteenth': '14',
  'fifteenth': '15', 'sixteenth': '16', 'seventeenth': '17', 'eighteenth': '18',
  'nineteenth': '19', 'twentieth': '20', 'twenty-first': '21', 'twenty-second': '22',
  'twenty-third': '23', 'twenty-fourth': '24', 'twenty-fifth': '25', 'twenty-sixth': '26',
  'twenty-seventh': '27', 'twenty-eighth': '28', 'twenty-ninth': '29', 'thirtieth': '30',
  'thirty-first': '31',
  'one': '1', 'two': '2', 'three': '3', 'four': '4', 'five': '5',
  'six': '6', 'seven': '7', 'eight': '8', 'nine': '9', 'ten': '10',
  'eleven': '11', 'twelve': '12', 'thirteen': '13', 'fourteen': '14',
  'fifteen': '15', 'sixteen': '16', 'seventeen': '17', 'eighteen': '18',
  'nineteen': '19', 'twenty': '20', 'twenty-one': '21', 'twenty-two': '22',
  'twenty-three': '23', 'twenty-four': '24', 'twenty-five': '25', 'twenty-six': '26',
  'twenty-seven': '27', 'twenty-eight': '28', 'twenty-nine': '29', 'thirty': '30',
  'thirty-one': '31'
};

function preprocessDateText(text) {
  let processed = text;
  
  // Replace number words with digits in date contexts
  // Match patterns like "May nineteen" or "nineteen May"
  Object.keys(numberWords).forEach(word => {
    const patterns = [
      // "May nineteen, 1979" -> "May 19, 1979"
      new RegExp(`(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec|January|February|March|April|May|June|July|August|September|October|November|December)\\s+${word}\\b`, 'gi'),
      // "nineteen May, 1979" -> "19 May, 1979"
      new RegExp(`\\b${word}\\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec|January|February|March|April|May|June|July|August|September|October|November|December)`, 'gi'),
      // "the nineteen of May" -> "the 19 of May"
      new RegExp(`\\b${word}\\s+of\\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec|January|February|March|April|May|June|July|August|September|October|November|December)`, 'gi'),
    ];
    
    patterns.forEach(pattern => {
      processed = processed.replace(pattern, (match) => {
        return match.replace(new RegExp(`\\b${word}\\b`, 'i'), numberWords[word]);
      });
    });
  });
  
  return processed;
}

/**
 * Parse a natural language date string into a structured format
 * 
 * @param {string} text - Natural language date text (e.g., "March 15, 1990", "15th March 1990")
 * @param {Object} options - Parsing options
 * @param {Date} options.referenceDate - Reference date for relative parsing (default: now)
 * @returns {Object|null} Parsed date object or null if parsing fails
 * @returns {string} return.date - ISO date string (YYYY-MM-DD)
 * @returns {number} return.year - Year
 * @returns {number} return.month - Month (1-12)
 * @returns {number} return.day - Day of month
 * @returns {number} return.confidence - Confidence score (0-1)
 * 
 * @example
 * parseNaturalDate("I was born on March 15, 1990")
 * // Returns: { date: "1990-03-15", year: 1990, month: 3, day: 15, confidence: 1 }
 * 
 * parseNaturalDate("born 25 years ago")
 * // Returns approximate date based on reference date
 */
export function parseNaturalDate(text, options = {}) {
  if (!text || typeof text !== 'string') return null;
  
  // Preprocess to convert number words to digits
  const processedText = preprocessDateText(text);
  console.log('Date parsing - original:', text, 'preprocessed:', processedText);
  
  const referenceDate = options.referenceDate || new Date();
  const results = chrono.parse(processedText, referenceDate, { forwardDate: false });
  
  if (!results || results.length === 0) return null;
  
  // Take the first (most confident) result
  const result = results[0];
  const date = result.start.date();
  
  if (!date) return null;
  
  const year = date.getFullYear();
  const month = date.getMonth() + 1; // chrono returns 0-indexed months
  const day = date.getDate();
  
  // Format as YYYY-MM-DD
  const isoDate = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  
  // Calculate confidence based on certainty of parsed components
  let confidence = 0.5; // base confidence
  if (result.start.isCertain('year')) confidence += 0.3;
  if (result.start.isCertain('month')) confidence += 0.15;
  if (result.start.isCertain('day')) confidence += 0.05;
  
  return {
    date: isoDate,
    year,
    month,
    day,
    confidence: Math.min(confidence, 1),
    originalText: result.text
  };
}

/**
 * Parse a natural language time string into a structured format
 * 
 * @param {string} text - Natural language time text (e.g., "2:30 PM", "14:30", "half past two")
 * @param {Object} options - Parsing options
 * @returns {Object|null} Parsed time object or null if parsing fails
 * @returns {string} return.time - Time string (HH:MM:SS)
 * @returns {number} return.hours - Hours (0-23)
 * @returns {number} return.minutes - Minutes (0-59)
 * @returns {number} return.seconds - Seconds (0-59)
 * @returns {number} return.confidence - Confidence score (0-1)
 * 
 * @example
 * parseNaturalTime("at 2:30 in the afternoon")
 * // Returns: { time: "14:30:00", hours: 14, minutes: 30, seconds: 0, confidence: 0.9 }
 */
export function parseNaturalTime(text, options = {}) {
  if (!text || typeof text !== 'string') return null;
  
  const results = chrono.parse(text, new Date(), { forwardDate: true });
  
  if (!results || results.length === 0) return null;
  
  const result = results[0];
  const date = result.start.date();
  
  if (!date) return null;
  
  const hours = date.getHours();
  const minutes = date.getMinutes();
  const seconds = date.getSeconds();
  
  // Format as HH:MM:SS
  const timeString = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  
  // Calculate confidence
  let confidence = 0.5;
  if (result.start.isCertain('hour')) confidence += 0.35;
  if (result.start.isCertain('minute')) confidence += 0.15;
  
  return {
    time: timeString,
    hours,
    minutes,
    seconds,
    confidence: Math.min(confidence, 1),
    originalText: result.text
  };
}

/**
 * Parse both date and time from natural language text
 * 
 * @param {string} text - Natural language date/time text
 * @param {Object} options - Parsing options
 * @returns {Object|null} Parsed date/time object or null if parsing fails
 * @returns {string} return.date - ISO date string (YYYY-MM-DD)
 * @returns {string} return.time - Time string (HH:MM:SS)
 * @returns {Object} return.dateComponents - Year, month, day
 * @returns {Object} return.timeComponents - Hours, minutes, seconds
 * @returns {number} return.confidence - Overall confidence score (0-1)
 * 
 * @example
 * parseNaturalDateTime("I was born on March 15, 1990 at 2:30 PM")
 * // Returns: { date: "1990-03-15", time: "14:30:00", ... }
 */
export function parseNaturalDateTime(text, options = {}) {
  if (!text || typeof text !== 'string') return null;
  
  const results = chrono.parse(text, new Date(), { forwardDate: false });
  
  if (!results || results.length === 0) return null;
  
  const result = results[0];
  const date = result.start.date();
  
  if (!date) return null;
  
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const hours = date.getHours();
  const minutes = date.getMinutes();
  const seconds = date.getSeconds();
  
  const isoDate = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  const timeString = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  
  // Calculate overall confidence
  let confidence = 0.3;
  if (result.start.isCertain('year')) confidence += 0.2;
  if (result.start.isCertain('month')) confidence += 0.15;
  if (result.start.isCertain('day')) confidence += 0.05;
  if (result.start.isCertain('hour')) confidence += 0.2;
  if (result.start.isCertain('minute')) confidence += 0.1;
  
  return {
    date: isoDate,
    time: timeString,
    dateComponents: { year, month, day },
    timeComponents: { hours, minutes, seconds },
    confidence: Math.min(confidence, 1),
    originalText: result.text
  };
}

/**
 * Extract birth-related information from natural language text
 * Looks for patterns like "born on", "birth date", etc.
 * 
 * @param {string} text - Natural language text potentially containing birth info
 * @returns {Object|null} Extracted birth information or null
 * @returns {string} return.date - Birth date (YYYY-MM-DD)
 * @returns {string} return.time - Birth time (HH:MM:SS) if available
 * @returns {string} return.place - Birth place if mentioned
 * @returns {number} return.confidence - Overall confidence score
 * 
 * @example
 * extractBirthInfo("I was born on March 15, 1990 at 2:30 PM in New Delhi")
 * // Returns: { date: "1990-03-15", time: "14:30:00", place: "New Delhi", ... }
 */
export function extractBirthInfo(text) {
  if (!text || typeof text !== 'string') return null;
  
  const result = {};
  
  // Try to parse date/time
  const dateTimeResult = parseNaturalDateTime(text);
  if (dateTimeResult) {
    result.date = dateTimeResult.date;
    result.time = dateTimeResult.time;
    result.confidence = dateTimeResult.confidence;
  }
  
  // Try to extract place using common patterns
  const placePatterns = [
    /\b(?:in|at|from)\s+([A-Z][a-zA-Z\s,]+?)(?:\s+(?:at|on|around|in the)|\.|$)/,
    /\bborn in\s+([A-Z][a-zA-Z\s,]+?)(?:\s+(?:at|on|around)|\.|$)/,
    /\bplace(?:\s+of\s+birth)?(?:\s+is|\s*:)?\s+([A-Z][a-zA-Z\s,]+?)(?:\.|$)/i
  ];
  
  for (const pattern of placePatterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      result.place = match[1].trim();
      break;
    }
  }
  
  return Object.keys(result).length > 0 ? result : null;
}

/**
 * Validate and normalize a date string
 * 
 * @param {string} dateStr - Date string to validate
 * @returns {boolean} True if valid date
 */
export function isValidDate(dateStr) {
  if (!dateStr) return false;
  const date = new Date(dateStr);
  return date instanceof Date && !isNaN(date);
}

/**
 * Convert various date formats to YYYY-MM-DD
 * 
 * @param {string} dateStr - Date string in any format
 * @returns {string|null} ISO date string or null if invalid
 */
export function normalizeDate(dateStr) {
  if (!dateStr) return null;
  
  // Try natural language parsing first
  const parsed = parseNaturalDate(dateStr);
  if (parsed && parsed.confidence > 0.7) {
    return parsed.date;
  }
  
  // Fallback to standard parsing
  try {
    const date = new Date(dateStr);
    if (!isNaN(date)) {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    }
  } catch (e) {
    // ignore
  }
  
  return null;
}

export default {
  parseNaturalDate,
  parseNaturalTime,
  parseNaturalDateTime,
  extractBirthInfo,
  isValidDate,
  normalizeDate
};
