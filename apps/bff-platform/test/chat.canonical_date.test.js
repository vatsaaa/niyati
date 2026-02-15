/**
 * Tests for POST /api/v1/chat canonical payload — verifies that the BFF
 * enriches the n8n payload with currentDate, currentDay, and currentTime
 * in metadata.session so the LLM knows the current date/time.
 */
const request = require('supertest');

describe('POST /api/v1/chat — canonical payload date enrichment', () => {
  let app;
  let capturedPayload = null;

  beforeAll(() => {
    jest.resetModules();
    process.env.NODE_ENV = 'test';
    process.env.SERVICE_TOKEN = '';

    // Mock axios to capture the payload forwarded to n8n
    jest.mock('axios', () => ({
      post: jest.fn(async (url, data) => {
        capturedPayload = data;
        return { status: 200, data: { output: 'test response' } };
      }),
      get: jest.fn(async () => ({ data: { status: 'ok' } }))
    }));

    // Set n8n webhook URL via commons config and bypass auth middleware
    jest.mock('@niyati/commons', () => {
      const real = jest.requireActual('@niyati/commons');
      return {
        ...real,
        config: {
          ...real.config,
          n8n: { webhookUrl: 'http://localhost:9999/webhook/chat', token: '' }
        },
        // Bypass authenticateOrReject so POST /chat doesn't 401
        authenticateOrReject: (req, res, next) => next()
      };
    });

    app = require('../src/index');
    // Provide a no-op DB that doesn't fail
    app.set('db', {
      query: jest.fn(async () => ({ rows: [], rowCount: 0 }))
    });
  });

  afterAll(() => {
    jest.restoreAllMocks();
  });

  beforeEach(() => {
    capturedPayload = null;
  });

  test('metadata.session includes currentDate, currentDay, currentTime', async () => {
    const res = await request(app)
      .post('/api/v1/chat')
      .send({
        message: 'What is the date today?',
        sessionId: '+919999999999',
        metadata: {
          user: { name: 'Ankur', birthDate: '1979-05-19', placeOfBirth: 'New Delhi' }
        }
      });

    expect(res.statusCode).toBe(200);

    // The captured payload forwarded to n8n should have date fields
    expect(capturedPayload).toBeTruthy();
    const session = capturedPayload.metadata.session;
    expect(session).toHaveProperty('currentDate');
    expect(session).toHaveProperty('currentDay');
    expect(session).toHaveProperty('currentTime');

    // currentDate should be a valid YYYY-MM-DD string
    expect(session.currentDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    // currentDay should be a weekday name
    expect(['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'])
      .toContain(session.currentDay);
    // currentTime should match HH:MM pattern
    expect(session.currentTime).toMatch(/^\d{2}:\d{2}$/);
  });

  test('metadata.session.currentDate matches today', async () => {
    const res = await request(app)
      .post('/api/v1/chat')
      .send({
        message: 'Hello',
        sessionId: '+919999999999',
        metadata: { user: { name: 'Test' } }
      });

    expect(res.statusCode).toBe(200);
    expect(capturedPayload).toBeTruthy();

    const today = new Date();
    const expectedDate = today.toISOString().slice(0, 10);
    expect(capturedPayload.metadata.session.currentDate).toBe(expectedDate);
  });
});
