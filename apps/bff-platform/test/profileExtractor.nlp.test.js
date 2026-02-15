const request = require('supertest');
const { createTestApp } = require('@test-helpers');

describe('NLP merge behavior (profile extractor router)', () => {
  let app;

  beforeEach(() => {
    jest.resetModules();
    // Mock commons responses/helpers
    jest.mock('@niyati/commons', () => {
      const responses = require('@niyati/commons/lib/responses');
      return {
        logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
        sanitize: v => v,
        ErrorCodes: responses.ErrorCodes,
        config: {},
        dateUtils: { computeIsAdult: jest.fn(() => true), validateDateOfBirth: jest.fn(() => ({ valid: true })) },
        authenticateOrReject: (req, res, next) => next()
      };
    });

    // Mock the local nlpClassifier to return deterministic NLP entities
    jest.mock('../lib/nlpClassifier', () => ({
      classifyMessage: jest.fn(async (text) => {
        // Simple mocked behavior based on input text
        if (/anupama|anupama sharma|call me anupama/i.test(text)) {
          return { entities: [{ entity: 'person', sourceText: 'Anupama Sharma' }] };
        }
        if (/call me|callme|callme/i.test(text)) {
          return { entities: [{ entity: 'person', sourceText: 'Sita Devi' }] };
        }
        if (/pune/i.test(text)) {
          return { entities: [{ entity: 'place', sourceText: 'Pune' }] };
        }
        return { entities: [] };
      })
    }));

    const router = require('../lib/profileExtractor');
    const { app: testApp } = createTestApp('/api/v1/profile', router);
    app = testApp;
  });

  afterEach(() => jest.restoreAllMocks());

  test('uses NLP entities when deterministic extractor misses name', async () => {
    const res = await request(app)
      .post('/api/v1/profile/extract')
      .send({ text: 'Call me Sita Devi, born in Pune on 1 Jan 1990' });

    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.data.name).toBe('Sita Devi');
    // Chrono should still pick up date
    expect(res.body.data.dob).toBe('1990-01-01');
    expect(res.body.data.placeOfBirth).toBeDefined();
    expect(res.body.data.placeOfBirth.toLowerCase()).toContain('pune');
  });

  test('nlp fills place when deterministic extractor misses it', async () => {
    const res = await request(app)
      .post('/api/v1/profile/extract')
      .send({ text: 'My id: 12345. Call me Sita Devi. Born 5 May 1985 in Pune' });

    expect(res.statusCode).toBe(200);
    expect(res.body.data.name).toBe('Sita Devi');
    expect(res.body.data.placeOfBirth && res.body.data.placeOfBirth.toLowerCase()).toContain('pune');
  });

  test('nlp name should override deterministic name when both present', async () => {
    // Mock input that deterministic regex might pick a shorter name, but NLP returns full name
    const res = await request(app)
      .post('/api/v1/profile/extract')
      .send({ text: 'Hi, I am Anu, call me Anupama Sharma born in Pune on 2 Feb 1992' });

    expect(res.statusCode).toBe(200);
    expect(res.body.data.name).toBe('Anupama Sharma');
    expect(res.body.data.placeOfBirth && res.body.data.placeOfBirth.toLowerCase()).toContain('pune');
  });

  test('falls back to deterministic when NLP returns nothing', async () => {
    const res = await request(app)
      .post('/api/v1/profile/extract')
      .send({ text: 'My name is Rohit Verma, born on 10 Oct 1988 in Jaipur' });

    expect(res.statusCode).toBe(200);
    expect(res.body.data.name).toBe('Rohit Verma');
    expect(res.body.data.placeOfBirth && res.body.data.placeOfBirth.toLowerCase()).toContain('jaipur');
  });
});
