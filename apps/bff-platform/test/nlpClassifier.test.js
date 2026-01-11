const {
  isCasualConversation,
  isHoroscopeQuery,
  isPremiumAstrologyQuery,
  isFutureQuestion,
  isTodayQuestion,
  getQueryType,
  getQueryCreditCost,
  classifyMessage
} = require('../lib/nlpClassifier');

describe('nlpClassifier (NLP.js-based)', () => {
  // Note: NLP.js trains async on first call, so tests may be slower initially
  
  describe('classifyMessage', () => {
    test('classifies greetings correctly', async () => {
      const result = await classifyMessage('Hello there');
      expect(result.intent).toMatch(/casual/);
      expect(result.score).toBeGreaterThan(0.5);
    });

    test('classifies horoscope queries correctly', async () => {
      const result = await classifyMessage('What is my horoscope today?');
      expect(result.intent).toMatch(/horoscope/);
    });

    test('classifies future predictions correctly', async () => {
      const result = await classifyMessage('What does tomorrow hold for me?');
      expect(result.intent).toMatch(/prediction.future/);
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

    test('identifies thanks as casual', async () => {
      expect(await isCasualConversation('Thank you')).toBe(true);
      expect(await isCasualConversation('Thanks')).toBe(true);
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
      expect(await isHoroscopeQuery('How is my day today?')).toBe(true);
      expect(await isHoroscopeQuery('Daily horoscope')).toBe(true);
    });

    test('identifies zodiac queries', async () => {
      expect(await isHoroscopeQuery('What is my zodiac sign?')).toBe(true);
      expect(await isHoroscopeQuery('Tell me about my sun sign')).toBe(true);
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

    test('identifies career queries', async () => {
      expect(await isPremiumAstrologyQuery('Career prediction')).toBe(true);
      expect(await isPremiumAstrologyQuery('When will I get a job?')).toBe(true);
    });

    test('identifies relationship queries', async () => {
      expect(await isPremiumAstrologyQuery('Love compatibility')).toBe(true);
      expect(await isPremiumAstrologyQuery('Marriage timing')).toBe(true);
    });

    test('identifies remedy queries', async () => {
      expect(await isPremiumAstrologyQuery('Remedies for Saturn')).toBe(true);
      expect(await isPremiumAstrologyQuery('Which gemstone should I wear?')).toBe(true);
    });

    test('returns false for horoscope queries', async () => {
      expect(await isPremiumAstrologyQuery('What is my horoscope today?')).toBe(false);
    });
  });

  describe('isFutureQuestion', () => {
    test('identifies tomorrow questions', async () => {
      expect(await isFutureQuestion('What does tomorrow hold for me?')).toBe(true);
      expect(await isFutureQuestion('Tell me about tomorrow')).toBe(true);
    });

    test('identifies future time references', async () => {
      expect(await isFutureQuestion('How will next week be?')).toBe(true);
      expect(await isFutureQuestion('What about next month?')).toBe(true);
    });

    test('identifies life event questions', async () => {
      expect(await isFutureQuestion('When will I get married?')).toBe(true);
      expect(await isFutureQuestion('Will I get a promotion?')).toBe(true);
      expect(await isFutureQuestion('When will I have children?')).toBe(true);
    });

    test('returns false for today questions', async () => {
      expect(await isFutureQuestion('How is my day today?')).toBe(false);
      expect(await isFutureQuestion('What is my horoscope today?')).toBe(false);
    });
  });

  describe('isTodayQuestion', () => {
    test('identifies today horoscope queries', async () => {
      expect(await isTodayQuestion('What is my horoscope today?')).toBe(true);
      expect(await isTodayQuestion('How is my day today?')).toBe(true);
      expect(await isTodayQuestion('What does today hold for me?')).toBe(true);
    });

    test('returns false for future questions', async () => {
      expect(await isTodayQuestion('What does tomorrow hold for me?')).toBe(false);
      expect(await isTodayQuestion('When will I get married?')).toBe(false);
    });
  });

  describe('getQueryType', () => {
    test('returns casual for greetings', async () => {
      expect(await getQueryType('Hello')).toBe('casual');
      expect(await getQueryType('Thank you')).toBe('casual');
    });

    test('returns horoscope for daily queries', async () => {
      expect(await getQueryType('What is my horoscope today?')).toBe('horoscope');
      expect(await getQueryType('How is my day?')).toBe('horoscope');
    });

    test('returns premium for birth chart queries', async () => {
      expect(await getQueryType('Show me my birth chart')).toBe('premium');
      expect(await getQueryType('Career prediction')).toBe('premium');
    });

    test('returns premium for future predictions', async () => {
      expect(await getQueryType('What does tomorrow hold?')).toBe('premium');
      expect(await getQueryType('When will I get married?')).toBe('premium');
    });
  });

  describe('getQueryCreditCost', () => {
    const config = {
      credits_horoscope_cost: 2,
      credits_premium_cost: 4
    };

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

    test('returns premium cost for future predictions', async () => {
      expect(await getQueryCreditCost('What does tomorrow hold?', config)).toBe(4);
    });

    test('uses defaults when config not provided', async () => {
      expect(await getQueryCreditCost('Show me my birth chart')).toBe(4);
    });
  });
});
