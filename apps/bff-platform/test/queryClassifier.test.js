const { 
  classify, 
  isTodayQuestion, 
  isFutureQuestion,
  isAstrologyRelated,
  getInsufficientCreditsMessage,
  getExhaustedCreditsMessage,
  isHoroscopeQuery,
  isPremiumAstrologyQuery,
  isCasualConversation,
  getQueryCreditCost,
  getQueryType
} = require('../lib/queryClassifier');

describe('queryClassifier', () => {
  describe('isTodayQuestion', () => {
    test('identifies explicit today questions', () => {
      expect(isTodayQuestion('How is my day today?')).toBe(true);
      expect(isTodayQuestion("What's today's horoscope?")).toBe(true);
      expect(isTodayQuestion('Give me my horoscope for today')).toBe(true);
    });

    test('identifies immediate timeframe questions', () => {
      expect(isTodayQuestion('What should I wear tonight?')).toBe(true);
      expect(isTodayQuestion('I have an interview this morning')).toBe(true);
      expect(isTodayQuestion('What color shirt for my meeting this afternoon?')).toBe(true);
    });

    test('identifies context-based today questions', () => {
      expect(isTodayQuestion('I am going for an interview, what should I wear?')).toBe(true);
      expect(isTodayQuestion('What is my lucky color today?')).toBe(true);
      expect(isTodayQuestion('I have an exam right now')).toBe(true);
    });

    test('returns false for non-today questions', () => {
      expect(isTodayQuestion('When will I get married?')).toBe(false);
      expect(isTodayQuestion('How will my career be next year?')).toBe(false);
      expect(isTodayQuestion('Tell me about my future')).toBe(false);
    });
  });

  describe('isFutureQuestion', () => {
    test('identifies explicit future questions', () => {
      expect(isFutureQuestion('How will my career be in the next 6 months?')).toBe(true);
      expect(isFutureQuestion('When will I get married?')).toBe(true);
      expect(isFutureQuestion('Will I be healthy in the future?')).toBe(true);
    });

    test('identifies pattern-based future questions', () => {
      expect(isFutureQuestion('Will I get a promotion next year?')).toBe(true);
      expect(isFutureQuestion('In 3 months, how will my finances be?')).toBe(true);
      expect(isFutureQuestion('My future career prospects')).toBe(true);
    });

    test('identifies life event questions as future', () => {
      expect(isFutureQuestion('When is my marriage?')).toBe(true);
      expect(isFutureQuestion('Will I have children?')).toBe(true);
      expect(isFutureQuestion('Can I go abroad for studies?')).toBe(true);
    });

    test('identifies tomorrow as future', () => {
      expect(isFutureQuestion('What does tomorrow hold for me?')).toBe(true);
      expect(isFutureQuestion('Tell me about tomorrow')).toBe(true);
      expect(isFutureQuestion('What about next week?')).toBe(true);
    });

    test('returns false for today questions', () => {
      expect(isFutureQuestion('How is my day today?')).toBe(false);
      expect(isFutureQuestion("Today's horoscope please")).toBe(false);
    });
  });

  describe('classify', () => {
    test('classifies today questions correctly', () => {
      expect(classify('How is my day today?')).toBe('today');
      expect(classify("Give me today's horoscope")).toBe('today');
      expect(classify('What should I wear to my interview?')).toBe('today');
    });

    test('classifies future questions correctly', () => {
      expect(classify('How will my career be in the next 6 months?')).toBe('future');
      expect(classify('When will I get married?')).toBe('future');
      expect(classify('Will I get a promotion?')).toBe('future');
    });

    test('defaults to today when unclear', () => {
      expect(classify('Tell me something')).toBe('today');
      expect(classify('Hi there')).toBe('today');
      expect(classify('')).toBe('today');
      expect(classify(null)).toBe('today');
    });

    test('today takes precedence over future when both present', () => {
      // "today" keyword should win
      expect(classify('Will I get married? But first, today horoscope')).toBe('today');
    });
  });

  describe('isAstrologyRelated', () => {
    test('identifies astrology-related questions', () => {
      expect(isAstrologyRelated('What is my horoscope?')).toBe(true);
      expect(isAstrologyRelated('Tell me about my birth chart')).toBe(true);
      expect(isAstrologyRelated('What is my sun sign?')).toBe(true);
      expect(isAstrologyRelated('Shani dasha effects')).toBe(true);
    });

    test('identifies life-related questions as astrology', () => {
      expect(isAstrologyRelated('When will I get married?')).toBe(true);
      expect(isAstrologyRelated('My career prediction')).toBe(true);
      expect(isAstrologyRelated('Love compatibility')).toBe(true);
    });

    test('returns false for non-astrology questions', () => {
      expect(isAstrologyRelated('What is the weather today?')).toBe(false);
      expect(isAstrologyRelated('Hello there')).toBe(false);
      expect(isAstrologyRelated('Tell me a joke')).toBe(false);
    });
  });

  describe('message generators', () => {
    test('getInsufficientCreditsMessage returns valid message', () => {
      const msg = getInsufficientCreditsMessage(2, 4);
      expect(msg).toBeTruthy();
      expect(msg).toContain('2');
      expect(msg).toContain('4');
    });

    test('getExhaustedCreditsMessage returns valid message', () => {
      const msg = getExhaustedCreditsMessage();
      expect(msg).toBeTruthy();
      expect(msg.toLowerCase()).toContain('credit');
    });
  });

  // === Billing Classification Tests ===
  describe('isHoroscopeQuery', () => {
    test('identifies horoscope queries', () => {
      expect(isHoroscopeQuery("What's my horoscope today?")).toBe(true);
      expect(isHoroscopeQuery('Daily rashifal please')).toBe(true);
      expect(isHoroscopeQuery('My zodiac prediction')).toBe(true);
      expect(isHoroscopeQuery('Tell me my daily fortune')).toBe(true);
    });

    test('returns false for non-horoscope queries', () => {
      expect(isHoroscopeQuery('When will I get married?')).toBe(false);
      expect(isHoroscopeQuery('Hello')).toBe(false);
      expect(isHoroscopeQuery('What is my birth chart?')).toBe(false);
    });
  });

  describe('isPremiumAstrologyQuery', () => {
    test('identifies premium astrology queries', () => {
      expect(isPremiumAstrologyQuery('Show me my birth chart')).toBe(true);
      expect(isPremiumAstrologyQuery('My kundli analysis')).toBe(true);
      expect(isPremiumAstrologyQuery('When will I get married?')).toBe(true);
      expect(isPremiumAstrologyQuery('Career prediction for next year')).toBe(true);
      expect(isPremiumAstrologyQuery('What remedies should I do?')).toBe(true);
      expect(isPremiumAstrologyQuery('Shani mahadasha effects')).toBe(true);
    });

    test('returns false for casual/horoscope queries', () => {
      expect(isPremiumAstrologyQuery('Hello')).toBe(false);
      expect(isPremiumAstrologyQuery("What's my horoscope?")).toBe(false);
    });
  });

  describe('isCasualConversation', () => {
    test('identifies greetings', () => {
      expect(isCasualConversation('Hello')).toBe(true);
      expect(isCasualConversation('Hi there!')).toBe(true);
      expect(isCasualConversation('Hey')).toBe(true);
      expect(isCasualConversation('Good morning')).toBe(true);
      expect(isCasualConversation('Namaste')).toBe(true);
    });

    test('identifies thanks and feedback', () => {
      expect(isCasualConversation('Thank you')).toBe(true);
      expect(isCasualConversation('Thanks!')).toBe(true);
      expect(isCasualConversation('Great answer')).toBe(true);
    });

    test('identifies profile updates', () => {
      expect(isCasualConversation('My name is Priya')).toBe(true);
      expect(isCasualConversation('I was born in Mumbai')).toBe(true);
      expect(isCasualConversation('Born on Jan 15, 1990')).toBe(true);
    });

    test('returns false for astrology queries', () => {
      expect(isCasualConversation('What is my horoscope?')).toBe(false);
      expect(isCasualConversation('When will I get married?')).toBe(false);
    });
  });

  describe('getQueryCreditCost', () => {
    const config = {
      credits_horoscope_cost: 2,
      credits_premium_cost: 4
    };

    test('returns horoscope cost for horoscope queries', () => {
      expect(getQueryCreditCost("Today's horoscope", config)).toBe(2);
      expect(getQueryCreditCost('My zodiac reading', config)).toBe(2);
    });

    test('returns premium cost for premium queries', () => {
      expect(getQueryCreditCost('My birth chart analysis', config)).toBe(4);
      expect(getQueryCreditCost('When will I get married?', config)).toBe(4);
    });

    test('returns 0 for casual conversation', () => {
      expect(getQueryCreditCost('Hello!', config)).toBe(0);
      expect(getQueryCreditCost('Thank you', config)).toBe(0);
    });

    test('uses default config when not provided', () => {
      expect(getQueryCreditCost("Today's horoscope")).toBe(2);
      expect(getQueryCreditCost('Birth chart please')).toBe(4);
      expect(getQueryCreditCost('Hi')).toBe(0);
    });
  });

  describe('getQueryType', () => {
    test('returns horoscope for daily horoscope queries', () => {
      expect(getQueryType("What's my horoscope?")).toBe('horoscope');
      expect(getQueryType('Daily rashifal')).toBe('horoscope');
    });

    test('returns premium for deep astrology queries', () => {
      expect(getQueryType('My kundli analysis')).toBe('premium');
      expect(getQueryType('Marriage prediction')).toBe('premium');
    });

    test('returns casual for greetings and profile', () => {
      expect(getQueryType('Hello')).toBe('casual');
      expect(getQueryType('My name is Raj')).toBe('casual');
    });
  });
});
