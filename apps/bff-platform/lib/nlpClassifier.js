// Query classifier using NLP.js for better natural language understanding
// Replaces winkNLP with more powerful NLP.js library
// Provides intent classification, entity extraction, and sentiment analysis

const { NlpManager } = require('node-nlp');

// Initialize NLP manager
let nlpManager = null;
let isTraining = false;
let isTrained = false;

/**
 * Initialize and train the NLP model
 * Called lazily on first use
 */
async function initializeNLP() {
  if (isTrained) return nlpManager;
  if (isTraining) {
    // Wait for training to complete
    while (isTraining) {
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    return nlpManager;
  }

  isTraining = true;
  nlpManager = new NlpManager({ languages: ['en'], forceNER: true });

  // ============================================================================
  // INTENT: CASUAL CONVERSATION (greetings, thanks, profile updates)
  // ============================================================================
  nlpManager.addDocument('en', 'hi', 'casual.greeting');
  nlpManager.addDocument('en', 'hello', 'casual.greeting');
  nlpManager.addDocument('en', 'hey', 'casual.greeting');
  nlpManager.addDocument('en', 'namaste', 'casual.greeting');
  nlpManager.addDocument('en', 'good morning', 'casual.greeting');
  nlpManager.addDocument('en', 'good evening', 'casual.greeting');
  nlpManager.addDocument('en', 'good afternoon', 'casual.greeting');
  nlpManager.addDocument('en', 'how are you', 'casual.greeting');
  nlpManager.addDocument('en', 'what is up', 'casual.greeting');

  nlpManager.addDocument('en', 'thank you', 'casual.thanks');
  nlpManager.addDocument('en', 'thanks', 'casual.thanks');
  nlpManager.addDocument('en', 'appreciate it', 'casual.thanks');
  nlpManager.addDocument('en', 'that was helpful', 'casual.thanks');

  nlpManager.addDocument('en', 'my name is John', 'casual.profile');
  nlpManager.addDocument('en', 'I am Ankur', 'casual.profile');
  nlpManager.addDocument('en', 'born on May 19', 'casual.profile');
  nlpManager.addDocument('en', 'I was born in New Delhi', 'casual.profile');
  nlpManager.addDocument('en', 'birth time is 7:31 am', 'casual.profile');

  // ============================================================================
  // INTENT: HOROSCOPE (daily horoscope, zodiac sign info - TODAY focused)
  // ============================================================================
  nlpManager.addDocument('en', 'what is my horoscope today', 'horoscope.today');
  nlpManager.addDocument('en', 'give me today horoscope', 'horoscope.today');
  nlpManager.addDocument('en', 'how is my day today', 'horoscope.today');
  nlpManager.addDocument('en', 'what does today hold for me', 'horoscope.today');
  nlpManager.addDocument('en', 'daily horoscope', 'horoscope.today');
  nlpManager.addDocument('en', 'today rashifal', 'horoscope.today');
  nlpManager.addDocument('en', 'how is my day', 'horoscope.today');
  nlpManager.addDocument('en', 'my day today', 'horoscope.today');
  nlpManager.addDocument('en', 'todays predictions', 'horoscope.today');
  
  nlpManager.addDocument('en', 'my zodiac sign', 'horoscope.general');
  nlpManager.addDocument('en', 'what is my rashi', 'horoscope.general');
  nlpManager.addDocument('en', 'tell me about my sun sign', 'horoscope.general');

  // ============================================================================
  // INTENT: FUTURE PREDICTIONS (tomorrow, next week/month, future events)
  // ============================================================================
  nlpManager.addDocument('en', 'what does tomorrow hold for me', 'prediction.future');
  nlpManager.addDocument('en', 'tell me about tomorrow', 'prediction.future');
  nlpManager.addDocument('en', 'how will next week be', 'prediction.future');
  nlpManager.addDocument('en', 'what about next month', 'prediction.future');
  nlpManager.addDocument('en', 'when will I get married', 'prediction.future');
  nlpManager.addDocument('en', 'will I get a promotion', 'prediction.future');
  nlpManager.addDocument('en', 'what is my future', 'prediction.future');
  nlpManager.addDocument('en', 'when will I have children', 'prediction.future');
  nlpManager.addDocument('en', 'will I go abroad', 'prediction.future');

  // ============================================================================
  // INTENT: PREMIUM ASTROLOGY (birth chart, career, marriage, detailed analysis)
  // ============================================================================
  nlpManager.addDocument('en', 'show me my birth chart', 'premium.chart');
  nlpManager.addDocument('en', 'kundli analysis', 'premium.chart');
  nlpManager.addDocument('en', 'natal chart reading', 'premium.chart');

  nlpManager.addDocument('en', 'career prediction', 'premium.career');
  nlpManager.addDocument('en', 'when will I get a job', 'premium.career');
  nlpManager.addDocument('en', 'business prospects', 'premium.career');

  nlpManager.addDocument('en', 'love compatibility', 'premium.relationship');
  nlpManager.addDocument('en', 'marriage timing', 'premium.relationship');
  nlpManager.addDocument('en', 'relationship advice', 'premium.relationship');

  nlpManager.addDocument('en', 'health prediction', 'premium.health');
  nlpManager.addDocument('en', 'wealth forecast', 'premium.wealth');
  nlpManager.addDocument('en', 'financial astrology', 'premium.wealth');

  nlpManager.addDocument('en', 'remedies for saturn', 'premium.remedy');
  nlpManager.addDocument('en', 'which gemstone should I wear', 'premium.remedy');
  nlpManager.addDocument('en', 'mantra for success', 'premium.remedy');

  // Train the model
  await nlpManager.train();
  isTraining = false;
  isTrained = true;

  return nlpManager;
}

/**
 * Classify a message using NLP.js
 * @param {string} text - The user's message
 * @returns {Promise<object>} Classification result with intent, score, entities
 */
async function classifyMessage(text) {
  if (!text || typeof text !== 'string') {
    return { intent: 'casual.greeting', score: 0, entities: [] };
  }

  const manager = await initializeNLP();
  const result = await manager.process('en', text);

  return {
    intent: result.intent || 'horoscope.today', // default to horoscope
    score: result.score || 0,
    sentiment: result.sentiment,
    entities: result.entities || [],
    classifications: result.classifications || []
  };
}

/**
 * Check if query is casual conversation (not billable)
 */
async function isCasualConversation(text) {
  const result = await classifyMessage(text);
  return result.intent.startsWith('casual.');
}

/**
 * Check if query is about horoscope (lower cost)
 */
async function isHoroscopeQuery(text) {
  const result = await classifyMessage(text);
  return result.intent.startsWith('horoscope.');
}

/**
 * Check if query is premium astrology (higher cost)
 */
async function isPremiumAstrologyQuery(text) {
  const result = await classifyMessage(text);
  return result.intent.startsWith('premium.');
}

/**
 * Check if query is about future (requires paid credits)
 */
async function isFutureQuestion(text) {
  const result = await classifyMessage(text);
  // Future predictions OR premium intents are considered "future"
  return result.intent.startsWith('prediction.future');
}

/**
 * Check if query is about today (allowed for free users)
 */
async function isTodayQuestion(text) {
  const result = await classifyMessage(text);
  return result.intent === 'horoscope.today';
}

/**
 * Get query type classification
 * @param {string} text - The user's message
 * @returns {Promise<string>} 'casual' | 'horoscope' | 'premium'
 */
async function getQueryType(text) {
  const result = await classifyMessage(text);
  
  if (result.intent.startsWith('casual.')) return 'casual';
  if (result.intent.startsWith('premium.')) return 'premium';
  if (result.intent.startsWith('prediction.')) return 'premium'; // Future predictions are premium
  if (result.intent.startsWith('horoscope.')) return 'horoscope';
  
  return 'horoscope'; // default
}

/**
 * Determine credit cost for a query
 * @param {string} text - The user's message
 * @param {object} config - Credits configuration from app_config
 * @returns {Promise<number>} Credit cost
 */
async function getQueryCreditCost(text, config = {}) {
  const horoscopeCost = config.credits_horoscope_cost || 2;
  const premiumCost = config.credits_premium_cost || 4;
  
  const queryType = await getQueryType(text);
  
  if (queryType === 'casual') return 0;
  if (queryType === 'premium') return premiumCost;
  return horoscopeCost;
}

/**
 * Temporal classification (for backward compatibility with old queryClassifier)
 * @param {string} text - The user's message
 * @returns {Promise<string>} 'today' | 'future'
 */
async function classify(text) {
  const isFuture = await isFutureQuestion(text);
  return isFuture ? 'future' : 'today';
}

module.exports = {
  initializeNLP,
  classifyMessage,
  isCasualConversation,
  isHoroscopeQuery,
  isPremiumAstrologyQuery,
  isFutureQuestion,
  isTodayQuestion,
  getQueryType,
  getQueryCreditCost,
  classify, // for backward compatibility
  // Additional helpers for compatibility with legacy tests and callers
  isAstrologyRelated,
  getInsufficientCreditsMessage,
  getExhaustedCreditsMessage
};

/**
 * Helper: Check if question is astrology-related (synchronous)
 */
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

/**
 * Generate varied insufficient credits message (synchronous)
 */
function getInsufficientCreditsMessage(credits, needed) {
  const messages = [
    `You have ${credits} credits remaining, but this question requires ${needed} credits. Please add more credits to continue exploring your cosmic journey.`,
    `This insight requires ${needed} credits, and you have ${credits}. Consider upgrading to unlock deeper astrological wisdom.`,
    `I'd love to help with this, but you need ${needed} credits (you have ${credits}). Add credits to continue your celestial exploration.`
  ];
  return messages[Math.floor(Math.random() * messages.length)];
}

/**
 * Generate varied exhausted credits message (synchronous)
 */
function getExhaustedCreditsMessage() {
  const messages = [
    "You've used all your credits for this month. The stars will await your return! Consider upgrading for continued cosmic guidance.",
    "Your monthly credits have been fully explored. Upgrade to a paid subscription to continue your astrological journey.",
    "All credits have been used. To keep unveiling what destiny holds, please add more credits or upgrade your subscription."
  ];
  return messages[Math.floor(Math.random() * messages.length)];
}
