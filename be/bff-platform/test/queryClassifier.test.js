const { 
  classify, 
  isTodayQuestion, 
  isFutureQuestion,
  isAstrologyRelated,
  getInsufficientCreditsMessage,
  getExhaustedCreditsMessage
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
});
