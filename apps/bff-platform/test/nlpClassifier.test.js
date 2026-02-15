const {
  classifyMessage,
  isCasualConversation,
  isHoroscopeQuery,
  isPremiumAstrologyQuery,
  isFutureQuestion,
  isTodayQuestion,
  getQueryType,
  getQueryCreditCost,
  classify,
  isAstrologyRelated,
  getInsufficientCreditsMessage,
  getExhaustedCreditsMessage,
  getSubIntent,
  SUB_INTENT_CREDIT_COST
} = require('../lib/nlpClassifier');

describe('nlpClassifier (NLP.js-based)', () => {
  // NLP.js trains asynchronously on first use; tests use async/await

  describe('classifyMessage', () => {
    test('classifies greetings correctly', async () => {
      const result = await classifyMessage('Hello there');
      expect(result.intent).toMatch(/casual/);
      expect(result.score).toBeGreaterThanOrEqual(0);
    });

    test('classifies horoscope queries correctly', async () => {
      const result = await classifyMessage('What is my horoscope today?');
      expect(result.intent).toMatch(/horoscope/);
    });

    test('classifies future predictions correctly', async () => {
      const result = await classifyMessage('What does tomorrow hold for me?');
      expect(result.intent).toMatch(/future|prediction/);
    });

    test('classifies premium queries correctly', async () => {
      const result = await classifyMessage('Show me my birth chart');
      expect(result.intent).toMatch(/premium/);
    });
  });

  describe('isCasualConversation', () => {
    test('identifies greetings as casual', async () => {
      expect(await isCasualConversation('Hi')).toBe(true);
      expect(await isCasualConversation('Hello')).toBe(true);
      expect(await isCasualConversation('Namaste')).toBe(true);
    });

    test('identifies profile updates as casual', async () => {
      expect(await isCasualConversation('My name is Ankur')).toBe(true);
      expect(await isCasualConversation('I was born on May 19')).toBe(true);
    });

    test('returns false for astrology queries', async () => {
      expect(await isCasualConversation('What is my horoscope today?')).toBe(false);
      expect(await isCasualConversation('Show me my birth chart')).toBe(false);
    });
  });

  describe('isHoroscopeQuery', () => {
    test('identifies horoscope queries', async () => {
      expect(await isHoroscopeQuery('What is my horoscope today?')).toBe(true);
      expect(await isHoroscopeQuery('Daily horoscope')).toBe(true);
    });

    test('returns false for premium queries', async () => {
      expect(await isHoroscopeQuery('Show me my birth chart')).toBe(false);
      expect(await isHoroscopeQuery('Career prediction')).toBe(false);
    });
  });

  describe('isPremiumAstrologyQuery', () => {
    test('identifies birth chart queries', async () => {
      expect(await isPremiumAstrologyQuery('Show me my birth chart')).toBe(true);
      expect(await isPremiumAstrologyQuery('Kundli analysis')).toBe(true);
    });

    test('identifies career and relationship queries', async () => {
      expect(await isPremiumAstrologyQuery('Career prediction')).toBe(true);
      expect(await isPremiumAstrologyQuery('Love compatibility')).toBe(true);
    });

    test('returns false for horoscope queries', async () => {
      expect(await isPremiumAstrologyQuery('What is my horoscope today?')).toBe(false);
    });
  });

  describe('isFutureQuestion and isTodayQuestion', () => {
    test('identifies tomorrow and future questions', async () => {
      expect(await isFutureQuestion('What does tomorrow hold for me?')).toBe(true);
      expect(await isFutureQuestion('When will I get married?')).toBe(true);
    });

    test('returns false for today questions in isFutureQuestion', async () => {
      expect(await isFutureQuestion('What is my horoscope today?')).toBe(false);
    });

    test('identifies today horoscope queries', async () => {
      expect(await isTodayQuestion('What is my horoscope today?')).toBe(true);
      expect(await isTodayQuestion('How is my day today?')).toBe(true);
    });

    test('returns false for future questions in isTodayQuestion', async () => {
      expect(await isTodayQuestion('What does tomorrow hold for me?')).toBe(false);
    });
  });

  describe('classify (temporal)', () => {
    test('classifies today questions correctly', async () => {
      expect(await classify('How is my day today?')).toBe('today');
    });

    test('classifies future questions correctly', async () => {
      expect(await classify('When will I get married?')).toBe('future');
    });

    test('defaults to today when unclear', async () => {
      expect(await classify('Hi there')).toBe('today');
      expect(await classify('')).toBe('today');
      expect(await classify(null)).toBe('today');
    });
  });

  describe('getQueryType', () => {
    test('returns casual for greetings', async () => {
      expect(await getQueryType('Hello')).toBe('casual');
      expect(await getQueryType('Thank you')).toBe('casual');
    });

    test('returns horoscope for daily queries', async () => {
      expect(await getQueryType('What is my horoscope today?')).toBe('horoscope');
    });

    test('returns premium for birth chart queries', async () => {
      expect(await getQueryType('Show me my birth chart')).toBe('premium');
      expect(await getQueryType('Career prediction')).toBe('premium');
    });
  });

  describe('getQueryCreditCost', () => {
    const config = { credits_horoscope_cost: 2, credits_premium_cost: 4 };

    test('returns 0 for casual conversation', async () => {
      expect(await getQueryCreditCost('Hello', config)).toBe(0);
      expect(await getQueryCreditCost('Thank you', config)).toBe(0);
    });

    test('returns horoscope cost for daily queries', async () => {
      expect(await getQueryCreditCost('What is my horoscope today?', config)).toBe(2);
    });

    test('returns premium cost for birth chart', async () => {
      expect(await getQueryCreditCost('Show me my birth chart', config)).toBe(4);
    });

    test('uses defaults when config not provided', async () => {
      expect(await getQueryCreditCost('Show me my birth chart')).toBe(4);
    });
  });

  describe('isAstrologyRelated (sync helper)', () => {
    test('returns true for astrology topics', () => {
      expect(isAstrologyRelated('What is my horoscope?')).toBe(true);
      expect(isAstrologyRelated('Tell me about my birth chart')).toBe(true);
      expect(isAstrologyRelated('When will I get married?')).toBe(true);
    });

    test('returns false for non-astrology questions', () => {
      expect(isAstrologyRelated('What is the weather today?')).toBe(false);
      expect(isAstrologyRelated('Hello there')).toBe(false);
    });
  });

  describe('message generators (sync helpers)', () => {
    test('getInsufficientCreditsMessage returns valid message', () => {
      const msg = getInsufficientCreditsMessage(2, 4);
      expect(typeof msg).toBe('string');
      expect(msg).toContain('2');
      expect(msg).toContain('4');
    });

    test('getExhaustedCreditsMessage returns valid message', () => {
      const msg = getExhaustedCreditsMessage();
      expect(typeof msg).toBe('string');
      expect(msg.toLowerCase()).toContain('credit');
    });
  });

  describe('getSubIntent (granular sub-intents)', () => {
    test('returns casual sub-intent for greetings', async () => {
      const result = await getSubIntent('Hello there');
      expect(result).toMatch(/^casual/);
    });

    test('returns horoscope sub-intent for horoscope queries', async () => {
      const result = await getSubIntent('What is my weekly horoscope?');
      expect(result).toMatch(/^horoscope/);
    });

    test('returns premium sub-intent for birth chart', async () => {
      const result = await getSubIntent('Show me my detailed birth chart');
      expect(result).toMatch(/^premium/);
    });

    test('returns prediction or premium sub-intent for marriage', async () => {
      const result = await getSubIntent('When will I get married?');
      expect(result).toMatch(/prediction|premium\.relationship/);
    });
  });

  describe('SUB_INTENT_CREDIT_COST map', () => {
    test('casual.greeting costs 0 credits', () => {
      expect(SUB_INTENT_CREDIT_COST['casual.greeting']).toBe(0);
    });

    test('horoscope.today uses config-based cost', () => {
      expect(SUB_INTENT_CREDIT_COST['horoscope.today']).toBe('horoscope');
    });

    test('prediction.marriage costs 3 credits', () => {
      expect(SUB_INTENT_CREDIT_COST['prediction.marriage']).toBe(3);
    });

    test('premium.chart costs 4 credits', () => {
      expect(SUB_INTENT_CREDIT_COST['premium.chart']).toBe(4);
    });

    test('premium.remedy costs 6 credits', () => {
      expect(SUB_INTENT_CREDIT_COST['premium.remedy']).toBe(6);
    });
  });

  describe('getQueryCreditCost (variable costs)', () => {
    const config = { credits_horoscope_cost: 2, credits_premium_cost: 4 };

    test('career prediction costs more than basic horoscope', async () => {
      const horoscopeCost = await getQueryCreditCost('What is my horoscope today?', config);
      const careerCost = await getQueryCreditCost('Will I get a promotion this year?', config);
      expect(careerCost).toBeGreaterThanOrEqual(horoscopeCost);
    });

    test('remedy queries cost the most', async () => {
      const remedyCost = await getQueryCreditCost('Which gemstone should I wear?', config);
      expect(remedyCost).toBeGreaterThanOrEqual(4);
    });
  });
});
