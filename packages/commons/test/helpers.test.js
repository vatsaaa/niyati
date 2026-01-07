const {
  createMockLogger,
  createMockDb,
  createMockCommons,
  createTestApp,
} = require('./helpers');

describe('test helpers', () => {
  describe('createMockLogger', () => {
    test('returns logger with all methods as Jest mocks', () => {
      const logger = createMockLogger();
      expect(typeof logger.debug).toBe('function');
      expect(typeof logger.info).toBe('function');
      expect(typeof logger.warn).toBe('function');
      expect(typeof logger.error).toBe('function');
      logger.info({ msg: 'test' });
      expect(logger.info).toHaveBeenCalledWith({ msg: 'test' });
    });
  });

  describe('createMockDb', () => {
    test('returns mock db with query method', () => {
      const mockDb = createMockDb({ rows: [{ id: 1 }], rowCount: 1 });
      expect(typeof mockDb.query).toBe('function');
    });

    test('uses provided result', async () => {
      const mockDb = createMockDb({ rows: [{ id: 42 }], rowCount: 1 });
      const result = await mockDb.query('SELECT * FROM users');
      expect(result.rows[0].id).toBe(42);
    });

    test('supports custom handler function', async () => {
      const mockDb = createMockDb((sql, params) => {
        if (sql.includes('INSERT')) {
          return { rows: [{ id: 99 }], rowCount: 1 };
        }
        return { rows: [], rowCount: 0 };
      });
      
      const insertResult = await mockDb.query('INSERT INTO users...');
      expect(insertResult.rows[0].id).toBe(99);
      
      const selectResult = await mockDb.query('SELECT * FROM users');
      expect(selectResult.rowCount).toBe(0);
    });

    test('defaults to empty result when no argument provided', async () => {
      const mockDb = createMockDb();
      const result = await mockDb.query('SELECT * FROM users');
      expect(result.rows).toEqual([]);
      expect(result.rowCount).toBe(0);
    });
  });

  describe('createMockCommons', () => {
    test('returns mock commons with standard exports', () => {
      const commons = createMockCommons();
      expect(commons.logger).toBeDefined();
      expect(commons.sanitize).toBeInstanceOf(Function);
      expect(commons.ErrorCodes).toBeDefined();
    });

    test('allows overriding specific exports', () => {
      const customLogger = { custom: jest.fn() };
      const commons = createMockCommons({ logger: customLogger });
      expect(commons.logger).toBe(customLogger);
    });
  });

  describe('createTestApp', () => {
    test('creates express app with router mounted', () => {
      const express = require('express');
      const mockRouter = express.Router();
      mockRouter.get('/test', (req, res) => res.sendSuccess({ ok: true }));
      
      const { app } = createTestApp('/api/v1/test', mockRouter);
      expect(app).toBeDefined();
    });

    test('attaches database when provided', () => {
      const express = require('express');
      const mockRouter = express.Router();
      const mockDb = createMockDb();
      
      const { app } = createTestApp('/api/v1/test', mockRouter, { db: mockDb });
      expect(app.get('db')).toBe(mockDb);
    });
  });
});
