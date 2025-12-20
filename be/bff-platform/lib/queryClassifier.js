// Query classifier to decide if a user question is "today" vs "future"
// Uses winkNLP for better natural language understanding

let winkNLP, model, nlp;
try {
  winkNLP = require('wink-nlp');
  model = require('wink-eng-lite-web-model');
  nlp = winkNLP(model);
} catch (e) {
  // winkNLP not available, will use fallback
  nlp = null;
}

// Keywords for classification
const TODAY_KEYWORDS = [
  'today', "today's", 'now', 'this morning', 'this evening', 'this afternoon', 
  'tonight', 'later today', 'right now', 'at the moment', 'currently',
  'this week', 'immediately', 'soon', 'shortly'
];

const FUTURE_KEYWORDS = [
  'next', 'future', 'will', 'when will', 'months', 'years', 'weeks',
  'in 6 months', 'in 3 months', 'long term', 'eventually', 'someday',
  'upcoming', 'later', 'next year', 'next month', 'next week',
  'marriage', 'married', 'career', 'job', 'promotion', 'children',
  'wedding', 'settle', 'abroad', 'immigration', 'business'
];

const IMMEDIATE_CONTEXT_KEYWORDS = [
  'interview', 'meeting', 'exam', 'test', 'date', 'appointment',
  'wear', 'color', 'dress', 'lucky', 'auspicious', 'travel today',
  'going', 'leaving', 'starting'
];

// Patterns that indicate future questions
const FUTURE_PATTERNS = [
  /when\s+will\s+i/i,
  /will\s+i\s+(get|be|have|find|meet|receive)/i,
  /in\s+\d+\s+(month|year|week|day)s?/i,
  /next\s+(month|year|week|few)/i,
  /my\s+future/i,
  /future\s+(of|prospects|career|marriage|life)/i,
  /going\s+to\s+(happen|be|get)/i,
  /long[\s-]?term/i
];

// Patterns that indicate today/immediate questions
const TODAY_PATTERNS = [
  /today['']?s?\s+horoscope/i,
  /horoscope\s+(for\s+)?today/i,
  /how\s+(will|is)\s+my\s+day/i,
  /what\s+should\s+i\s+wear/i,
  /what\s+color/i,
  /lucky\s+(color|number|day)/i,
  /going\s+for\s+(an?\s+)?interview/i,
  /have\s+(an?\s+)?(meeting|appointment|exam)/i,
  /right\s+now/i,
  /this\s+(morning|evening|afternoon|week)/i
];

function isTodayQuestion(text) {
  if (!text || typeof text !== 'string') return false;
  const t = text.toLowerCase();
  
  // Check today patterns first (more specific)
  for (const pattern of TODAY_PATTERNS) {
    if (pattern.test(t)) return true;
  }
  
  // Check immediate context keywords
  for (const keyword of IMMEDIATE_CONTEXT_KEYWORDS) {
    if (t.includes(keyword)) return true;
  }
  
  // Check today keywords
  for (const keyword of TODAY_KEYWORDS) {
    if (t.includes(keyword)) return true;
  }
  
  return false;
}

function isFutureQuestion(text) {
  if (!text || typeof text !== 'string') return false;
  const t = text.toLowerCase();
  
  // Check future patterns first (more specific)
  for (const pattern of FUTURE_PATTERNS) {
    if (pattern.test(t)) return true;
  }
  
  // Check future keywords
  for (const keyword of FUTURE_KEYWORDS) {
    if (t.includes(keyword)) {
      // Make sure it's not negated or in today context
      if (!isTodayQuestion(text)) return true;
    }
  }
  
  return false;
}

function classifyWithNLP(text) {
  if (!nlp || !text) return null;
  
  try {
    const doc = nlp.readDoc(text);
    const tokens = doc.tokens().out();
    const entities = doc.entities().out();
    
    // Look for date/time entities
    for (const entity of entities) {
      const lower = entity.toLowerCase();
      if (lower.includes('today') || lower.includes('now') || lower.includes('this')) {
        return 'today';
      }
      if (lower.includes('next') || lower.includes('future') || /\d+\s*(month|year|week)/i.test(lower)) {
        return 'future';
      }
    }
    
    // Analyze sentence structure for future tense
    const lowerText = text.toLowerCase();
    const hasFutureTense = /will\s+(i|my|be|have|get)/i.test(lowerText) || 
                          /going\s+to\s+(be|get|have)/i.test(lowerText);
    
    if (hasFutureTense && !isTodayQuestion(text)) {
      return 'future';
    }
    
    return null; // Let rule-based classifier decide
  } catch (e) {
    return null;
  }
}

function classify(text) {
  if (!text || typeof text !== 'string') return 'today';
  
  // Try NLP classification first
  const nlpResult = classifyWithNLP(text);
  if (nlpResult) return nlpResult;
  
  // Rule-based classification
  // Check today first (takes precedence for safety/cost)
  if (isTodayQuestion(text)) return 'today';
  if (isFutureQuestion(text)) return 'future';
  
  // Default to 'today' for safety (cheaper credits)
  return 'today';
}

// Check if question is astrology-related
function isAstrologyRelated(text) {
  if (!text || typeof text !== 'string') return false;
  const t = text.toLowerCase();
  
  const astrologyKeywords = [
    'horoscope', 'zodiac', 'astrology', 'star', 'planet', 'birth chart', 'kundali',
    'rashi', 'nakshatra', 'dasha', 'transit', 'moon sign', 'sun sign', 'ascendant',
    'lagna', 'graha', 'mangal', 'shani', 'rahu', 'ketu', 'jupiter', 'venus', 'mars',
    'saturn', 'mercury', 'prediction', 'prophecy', 'destiny', 'fate', 'fortune',
    'lucky', 'auspicious', 'muhurat', 'marriage', 'married', 'marry', 'career', 
    'job', 'promotion', 'health', 'wealth', 'money', 'finance',
    'love', 'relationship', 'compatibility', 'future', 'past life', 'karma',
    'children', 'child', 'baby', 'pregnant', 'travel', 'abroad', 'immigration'
  ];
  
  return astrologyKeywords.some(keyword => t.includes(keyword));
}

// Generate varied insufficient credits message
function getInsufficientCreditsMessage(credits, needed) {
  const messages = [
    `You have ${credits} credits remaining, but this question requires ${needed} credits. Please add more credits to continue exploring your cosmic journey.`,
    `This insight requires ${needed} credits, and you have ${credits}. Consider upgrading to unlock deeper astrological wisdom.`,
    `I'd love to help with this, but you need ${needed} credits (you have ${credits}). Add credits to continue your celestial exploration.`
  ];
  return messages[Math.floor(Math.random() * messages.length)];
}

// Generate varied exhausted credits message
function getExhaustedCreditsMessage() {
  const messages = [
    "You've used all your credits for this month. The stars will await your return! Consider upgrading for continued cosmic guidance.",
    "Your monthly credits have been fully explored. Upgrade to a paid subscription to continue your astrological journey.",
    "All credits have been used. To keep unveiling what destiny holds, please add more credits or upgrade your subscription."
  ];
  return messages[Math.floor(Math.random() * messages.length)];
}

module.exports = { 
  classify, 
  isTodayQuestion, 
  isFutureQuestion, 
  classifyWithNLP,
  isAstrologyRelated,
  getInsufficientCreditsMessage,
  getExhaustedCreditsMessage
};
