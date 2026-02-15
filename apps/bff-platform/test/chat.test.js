const request = require('supertest');
const { createTestApp, createMockDb, createMockCommons } = require('@test-helpers');

describe('bff-platform chat routes', () => {
    let app;

    beforeEach(() => {
        jest.resetModules();
        // Use helper for commons mock
        jest.mock('@niyati/commons', () => {
            const responses = require('@niyati/commons/lib/responses');
            return {
                logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn(), fatal: jest.fn(), trace: jest.fn(), warn: jest.fn(), error: jest.fn(), info: jest.fn() },
                sanitize: v => v,
                ErrorCodes: responses.ErrorCodes,
                config: {},
                dateUtils: { computeIsAdult: jest.fn(() => true), validateDateOfBirth: jest.fn(() => ({ valid: true })) }
            };
        });

        const chatRouter = require('../lib/chat');
        ({ app } = createTestApp('/api/v1/chat', chatRouter));
    });

    afterEach(() => jest.restoreAllMocks());

    describe('POST /classify', () => {
        test('returns error when message missing', async () => {
            const res = await request(app).post('/api/v1/chat/classify').send({});
            expect(res.statusCode).toBe(400);
            expect(res.body.status).toBe('error');
        });

        test('classifies horoscope and premium correctly', async () => {
            const res1 = await request(app).post('/api/v1/chat/classify').send({ message: "How is my day today?" });
            expect(res1.statusCode).toBe(200);
            expect(res1.body.data.queryType).toBe('horoscope');
            expect(res1.body.data.creditCost).toBe(2);
            expect(res1.body.data.isPremium).toBe(false);

            const res2 = await request(app).post('/api/v1/chat/classify').send({ message: 'When will I get married?' });
            expect(res2.statusCode).toBe(200);
            expect(res2.body.data.queryType).toBe('premium');
            expect(res2.body.data.creditCost).toBe(4);
            expect(res2.body.data.isPremium).toBe(true);
        });

        test('should be accessible without auth and return expected shape', async () => {
            const mockDb = createMockDb({ rows: [], rowCount: 0 });
            app.set('db', mockDb);

            const res = await request(app)
                .post('/api/v1/chat/classify')
                .send({ message: 'Hi I am Ankur, born on 19 May 1979' });

            expect(res.statusCode).toBe(200);
            expect(res.body.status).toBe('ok');
            expect(res.body.data).toHaveProperty('queryType');
            expect(res.body.data).toHaveProperty('creditCost');
            expect(res.body.data).toHaveProperty('isBillable');
            expect(res.body.data).toHaveProperty('isPremium');
            expect(res.body.data).toHaveProperty('isFutureQuery');
        });

        test('returns isFutureQuery true for future questions', async () => {
            const mockDb = createMockDb({ rows: [], rowCount: 0 });
            app.set('db', mockDb);

            const res = await request(app)
                .post('/api/v1/chat/classify')
                .send({ message: 'What does tomorrow hold for me?' });

            expect(res.statusCode).toBe(200);
            expect(res.body.status).toBe('ok');
            expect(res.body.data.isFutureQuery).toBe(true);
            expect(res.body.data.isBillable).toBe(true);
        });

        test('returns isFutureQuery false for today questions', async () => {
            const mockDb = createMockDb({ rows: [], rowCount: 0 });
            app.set('db', mockDb);

            const res = await request(app)
                .post('/api/v1/chat/classify')
                .send({ message: 'What does today hold for me?' });

            expect(res.statusCode).toBe(200);
            expect(res.body.status).toBe('ok');
            expect(res.body.data.isFutureQuery).toBe(false);
            expect(res.body.data.isBillable).toBe(true);
        });
    });
});
