/**
 * Tests for POST /api/v1/profile/extract endpoint
 * TDD: Tests written first, implementation follows
 */
const request = require('supertest');
const express = require('express');

describe('Profile Extractor API', () => {
  let app;

  beforeEach(() => {
    jest.resetModules();
    jest.mock('@niyati/commons', () => {
      const responses = require('@niyati/commons/lib/responses');
      return {
        logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn(), fatal: jest.fn(), trace: jest.fn(),  info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
        sanitize: v => v,
        ErrorCodes: responses.ErrorCodes,
        config: {}, dateUtils: { computeIsAdult: jest.fn(() => true) }
      };
    });

    const router = require('../lib/profileExtractor');
    app = express();
    app.use(express.json());
    const { attachResponseHelpers } = require('@niyati/commons/lib/responses');
    app.use('/api/v1/profile', attachResponseHelpers, router);
  });

  afterEach(() => jest.restoreAllMocks());

  describe('POST /extract', () => {
    test('returns empty object for null/empty text', async () => {
      const res = await request(app)
        .post('/api/v1/profile/extract')
        .send({ text: null });
      
      expect(res.statusCode).toBe(200);
      expect(res.body.status).toBe('ok');
      expect(res.body.data).toEqual({});
    });

    test('returns empty object for empty string', async () => {
      const res = await request(app)
        .post('/api/v1/profile/extract')
        .send({ text: '' });
      
      expect(res.statusCode).toBe(200);
      expect(res.body.status).toBe('ok');
      expect(res.body.data).toEqual({});
    });

    test('extracts name from "My name is X" pattern', async () => {
      const res = await request(app)
        .post('/api/v1/profile/extract')
        .send({ text: 'My name is Alice Smith' });
      
      expect(res.statusCode).toBe(200);
      expect(res.body.data.name).toBe('Alice Smith');
    });

    test('extracts name from "I am X" pattern', async () => {
      const res = await request(app)
        .post('/api/v1/profile/extract')
        .send({ text: 'I am John Doe' });
      
      expect(res.statusCode).toBe(200);
      expect(res.body.data.name).toBe('John Doe');
    });

    test('extracts ISO date of birth', async () => {
      const res = await request(app)
        .post('/api/v1/profile/extract')
        .send({ text: 'I was born on 1990-05-03' });
      
      expect(res.statusCode).toBe(200);
      expect(res.body.data.dob).toBe('1990-05-03');
    });

    test('extracts date from "19 May 1979" format', async () => {
      const res = await request(app)
        .post('/api/v1/profile/extract')
        .send({ text: 'Born on 19 May 1979' });
      
      expect(res.statusCode).toBe(200);
      expect(res.body.data.dob).toBe('1979-05-19');
    });

    test('extracts time of birth with am/pm', async () => {
      const res = await request(app)
        .post('/api/v1/profile/extract')
        .send({ text: 'I was born at 02:30 am' });
      
      expect(res.statusCode).toBe(200);
      expect(res.body.data.timeOfBirth).toBe('02:30 am');
    });

    test('extracts time of birth in 24-hour format', async () => {
      const res = await request(app)
        .post('/api/v1/profile/extract')
        .send({ text: 'Born at 14:30' });
      
      expect(res.statusCode).toBe(200);
      expect(res.body.data.timeOfBirth).toBe('14:30');
    });

    test('extracts place of birth from "born in X" pattern', async () => {
      const res = await request(app)
        .post('/api/v1/profile/extract')
        .send({ text: 'I was born in New Delhi' });
      
      expect(res.statusCode).toBe(200);
      expect(res.body.data.placeOfBirth).toBe('New Delhi');
    });

    test('extracts all fields from complete profile sentence', async () => {
      const res = await request(app)
        .post('/api/v1/profile/extract')
        .send({ text: 'My name is Alice and I was born on 1990-05-03 at 02:30 in Mumbai' });
      
      expect(res.statusCode).toBe(200);
      expect(res.body.data.name).toBe('Alice');
      expect(res.body.data.dob).toBe('1990-05-03');
      expect(res.body.data.timeOfBirth).toBe('02:30');
      expect(res.body.data.placeOfBirth).toBe('Mumbai');
    });

    test('extracts from comma-separated format', async () => {
      const res = await request(app)
        .post('/api/v1/profile/extract')
        .send({ text: 'Ankur Vatsa, 19 May 1979, 07:31 am, New Delhi' });
      
      expect(res.statusCode).toBe(200);
      expect(res.body.data.name).toBe('Ankur Vatsa');
      expect(res.body.data.dob).toBe('1979-05-19');
      expect(res.body.data.timeOfBirth).toBe('07:31 am');
      expect(res.body.data.placeOfBirth).toBe('New Delhi');
    });

    test('extracts place after time with "in" pattern', async () => {
      const res = await request(app)
        .post('/api/v1/profile/extract')
        .send({ text: 'Born at 11:01 am in Abu Dhabi' });
      
      expect(res.statusCode).toBe(200);
      expect(res.body.data.placeOfBirth).toBe('Abu Dhabi');
    });

    test('returns 400 for missing text field', async () => {
      const res = await request(app)
        .post('/api/v1/profile/extract')
        .send({});
      
      expect(res.statusCode).toBe(400);
      expect(res.body.status).toBe('error');
    });
  });
});
