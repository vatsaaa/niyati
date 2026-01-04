// Query classifier for billing and temporal classification
// Uses winkNLP for better natural language understanding
// Centralizes all classification logic server-side for security and auditability

let winkNLP, model, nlp;
try {
  winkNLP = require('wink-nlp');
  model = require('wink-eng-lite-web-model');
  nlp = winkNLP(model);
} catch (e) {
  // winkNLP not available, will use fallback
  nlp = null;
}

// ============================================================================
// BILLING CLASSIFICATION (horoscope vs premium vs casual)
// ============================================================================

// Horoscope keywords - basic daily/zodiac queries (lower cost)
const HOROSCOPE_KEYWORDS = [
  'horoscope', 'today', 'daily', 'zodiac', 'sign', 'aries', 'taurus', 'gemini',
  'cancer', 'leo', 'virgo', 'libra', 'scorpio', 'sagittarius', 'capricorn',
  'aquarius', 'pisces', 'rashifal', 'rashi', 'sun sign', 'moon sign'
];

// Premium astrology keywords - detailed readings (higher cost)
const PREMIUM_KEYWORDS = [
  // Birth chart and kundli
  'birth chart', 'kundli', 'kundali', 'natal chart', 'chart analysis',
  // Life areas
  'career', 'job', 'work', 'profession', 'business', 'money', 'wealth', 'finance', 'financial',
  'love', 'relationship', 'marriage', 'partner', 'spouse', 'compatibility', 'soulmate',
  'health', 'medical', 'disease', 'illness',
  'education', 'studies', 'exam', 'results',
  'travel', 'abroad', 'foreign', 'immigration', 'visa',
  'children', 'kids', 'pregnancy', 'fertility',
  'property', 'house', 'real estate', 'land',
  // Predictions and timing
  'predict', 'prediction', 'future', 'forecast', 'when will', 'will i',
  'dasha', 'mahadasha', 'antardasha', 'transit', 'gochar',
  // Remedies
  'remedy', 'remedies', 'solution', 'mantra', 'gemstone', 'stone', 'yantra',
  // Planets and houses
  'saturn', 'shani', 'rahu', 'ketu', 'jupiter', 'guru', 'venus', 'shukra',
  'mars', 'mangal', 'mercury', 'budh', 'moon', 'chandra', 'sun', 'surya',
  'house', 'bhava', 'ascendant', 'lagna'
];

// Predictive words that indicate billable content (NOT casual)
const PREDICTIVE_WORDS = [
  'future', 'predict', 'happen', 'luck', 'career', 'love', 'marriage', 'job', 'money',
  'horoscope', 'zodiac', 'kundli', 'kundali', 'chart', 'dasha', 'transit',
  'promotion', 'health', 'wealth', 'children', 'baby', 'travel', 'abroad',
  'forecast', 'prophecy', 'destiny', 'fate', 'rashifal'
];

// Profile information patterns - NEVER billable (user onboarding)
const PROFILE_PATTERNS = [
  /\b(i am|i'm|my name is|name is|this is)\b.*\b(born|dob|birth|birthday)\b/i,
  /\bborn\s+(in|on|at)\b/i,
  /\b(my|i was)\s+born\b/i,
  /\b(date of birth|dob|birthday)\s*(is|:)?\s*\d/i,
  /\b(birth\s*place|place of birth|birthplace)\b/i,
  /\b(birth\s*time|time of birth)\b/i,
  /\b\d{1,2}[:\s]?\d{2}\s*(am|pm)\b/i,
  /\b(january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{1,2}/i,
  /\b\d{1,2}\s+(january|february|march|april|may|june|july|august|september|october|november|december)/i,
  /\b(19|20)\d{2}\b/i
];

// Casual conversation patterns - NOT billable
const CASUAL_PATTERNS = [
  /^(hi|hello|hey|namaste|good\s*(morning|afternoon|evening|night))\b/i,
  /^(how are you|how're you|how do you do|what's up|wassup|sup)/i,
  /^(thank|thanks|thx)/i,
  /^(bye|goodbye|see you|take care|good night)/i,
  /^(ok|okay|alright|sure|yes|no|yeah|nope|yep)/i,
  /^(nice|great|awesome|cool|wow|amazing|wonderful)/i,
  /\b(how are you|how're you)\??$/i,
  /do you (remember|know|recall)/i,
  /you remember/i,
  /who am i/i,
  /what('s| is) my name/i,
  /tell me about (myself|me)/i,
  /who are you/i,
  /what('s| is) your name/i,
  /where are you (from|located|based|living)/i,
  /where do you live/i,
  /how old are you/i,
  /are you (real|human|ai|bot)/i,
  /what('s| is) the time/i,
  /what time is it/i,
  /what('s| is) the date/i,
  /what day is (it|today)/i,
  /you('re| are) (great|amazing|awesome|wonderful|helpful)/i,
  /i (like|love|enjoy) (talking|chatting) (to|with) you/i,
  /this is (fun|interesting|cool)/i,
  /^(really|oh|ah|hmm|haha|lol|ha ha)\??!?$/i,
  /^(i see|got it|understood|makes sense)$/i,
  /^(can you )?(tell|talk) (me )?(about )?today\??$/i,
  /^(i am|i'm|my name is)\s+[a-z]+$/i
];

/**
 * Check if user is asking about horoscope (lower cost)
 */
function isHoroscopeQuery(text) {
  if (!text || typeof text !== 'string') return false;
  const lowerText = text.toLowerCase();
  return HOROSCOPE_KEYWORDS.some(keyword => lowerText.includes(keyword));
}

/**
 * Check if user is asking a premium astrology question (higher cost)
 */
function isPremiumAstrologyQuery(text) {
  if (!text || typeof text !== 'string') return false;
  const lowerText = text.toLowerCase();
  return PREMIUM_KEYWORDS.some(keyword => lowerText.includes(keyword));
}

/**
 * Check if message is casual conversation (NOT billable)
 */
function isCasualConversation(text) {
  if (!text || typeof text !== 'string') return false;
  const lowerText = text.toLowerCase().trim();
  
  // If ANY predictive words appear, it's billable (NOT casual)
  if (PREDICTIVE_WORDS.some(p => lowerText.includes(p))) return false;
  
  // Profile information is not billable
  if (PROFILE_PATTERNS.some(pattern => pattern.test(lowerText))) return true;
  
  // Check casual patterns
  if (CASUAL_PATTERNS.some(pattern => pattern.test(lowerText))) return true;
  
  // Short messages (<=6 words) without predictive keywords are casual
  const words = lowerText.split(/\s+/).filter(w => w.length > 0);
  if (words.length <= 6) {
    if (lowerText.includes('life has been') || 
        lowerText.includes('i am') || 
        lowerText.includes("i'm") ||
        lowerText.includes('been good') ||
        lowerText.includes('been great') ||
        lowerText.includes('been fine') ||
        lowerText.includes('weather') ||
        lowerText.includes('miss you') ||
        lowerText.includes('missed you')) {
      return true;
    }
  }
  
  return false;
}

/**
 * Determine credit cost for a query
 * @param {string} text - The user's message
 * @param {object} config - Credits configuration from app_config
 * @returns {number} Credit cost (0 for casual, horoscope cost, or premium cost)
 */
function getQueryCreditCost(text, config = {}) {
  const horoscopeCost = config.credits_horoscope_cost || 2;
  const premiumCost = config.credits_premium_cost || 4;
  
  // Casual conversation = no charge
  if (isCasualConversation(text)) return 0;
  
  // Horoscope queries = lower cost
  if (isHoroscopeQuery(text)) return horoscopeCost;
  
  // Premium queries or default = higher cost
  if (isPremiumAstrologyQuery(text)) return premiumCost;
  
  // Default to horoscope cost for ambiguous queries
  return horoscopeCost;
}

/**
 * Get query type classification
 * @param {string} text - The user's message
 * @returns {string} 'casual' | 'horoscope' | 'premium'
 */
function getQueryType(text) {
  if (isCasualConversation(text)) return 'casual';
  if (isPremiumAstrologyQuery(text)) return 'premium';
  if (isHoroscopeQuery(text)) return 'horoscope';
  return 'horoscope'; // default
}

// ============================================================================
// TEMPORAL CLASSIFICATION (today vs future) - existing functionality
// ============================================================================

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
  // Billing classification (new)
  isHoroscopeQuery,
  isPremiumAstrologyQuery,
  isCasualConversation,
  getQueryCreditCost,
  getQueryType,
  // Temporal classification (existing)
  classify, 
  isTodayQuestion, 
  isFutureQuestion, 
  classifyWithNLP,
  isAstrologyRelated,
  getInsufficientCreditsMessage,
  getExhaustedCreditsMessage
};
