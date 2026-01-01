/**
 * Shared test utilities for all services
 * Reduces duplication across bff-platform, bff-auth, and worker test suites
 */

/**
 * Creates a mock logger compatible with pino's logger interface
 * All log methods are Jest mocks that can be inspected/asserted
 */
function createMockLogger() {
  return {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    fatal: jest.fn(),
    trace: jest.fn(),
  };
}

/**
 * Creates a mock database pool/client with query method
 * Usage:
 *   const mockDb = createMockDb({ rows: [{ id: 1 }], rowCount: 1 });
 *   app.set('db', mockDb);
 * 
 * Or with custom query handler:
 *   const mockDb = createMockDb((sql, params) => {
 *     if (sql.includes('INSERT')) return { rows: [{ id: 99 }], rowCount: 1 };
 *     return { rows: [], rowCount: 0 };
 *   });
 */
function createMockDb(resultOrHandler) {
  const mockDb = {
    query: jest.fn(),
  };

  if (typeof resultOrHandler === 'function') {
    mockDb.query.mockImplementation(resultOrHandler);
  } else if (resultOrHandler) {
    mockDb.query.mockResolvedValue(resultOrHandler);
  } else {
    // Default: return empty result
    mockDb.query.mockResolvedValue({ rows: [], rowCount: 0 });
  }

  return mockDb;
}

/**
 * Creates mock commons module for jest.mock()
 * Usage in beforeEach:
 *   jest.mock('../commons', () => createMockCommons());
 * 
 * Optionally override specific exports:
 *   jest.mock('../commons', () => createMockCommons({ logger: myCustomLogger }));
 */
function createMockCommons(overrides = {}) {
  const responses = require('../lib/responses');
  
  return {
    logger: overrides.logger || createMockLogger(),
    sanitize: overrides.sanitize || (v => v),
    sanitizeEmail: overrides.sanitizeEmail || (v => v),
    sanitizeName: overrides.sanitizeName || (v => v),
    ErrorCodes: responses.ErrorCodes,
    config: overrides.config || {},
    ...overrides,
  };
}

/**
 * Creates a test Express app with response helpers attached
 * Usage:
 *   const { app, router } = createTestApp('/api/v1/users', require('../lib/users'));
 *   
 * With custom database:
 *   const mockDb = createMockDb({ rows: [{ id: 1 }], rowCount: 1 });
 *   const { app } = createTestApp('/api/v1/users', usersRouter, { db: mockDb });
 */
function createTestApp(mountPath, router, options = {}) {
  const express = require('express');
  const { attachResponseHelpers } = require('../lib/responses');
  
  const app = express();
  app.use(express.json());
  app.use(mountPath, attachResponseHelpers, router);
  
  if (options.db) {
    app.set('db', options.db);
  }
  
  return { app, router };
}

/**
 * Standard beforeEach setup for route tests that need mocked commons
 * Returns app and router for use in tests
 * 
 * Usage:
 *   let app;
 *   beforeEach(() => {
 *     ({ app } = setupRouteTest('../lib/users', '/api/v1/users'));
 *   });
 * 
 * NOTE: This function cannot setup jest.mock() due to Jest's limitations.
 * Users should call jest.mock('../commons', () => createMockCommons()) manually in beforeEach.
 */
function setupRouteTest(routerPath, mountPath, options = {}) {
  jest.resetModules();
  
  const router = require(routerPath);
  const { app } = createTestApp(mountPath, router, options);
  
  return { app, router };
}

/**
 * Standard afterEach cleanup
 * Restores all mocks and spies
 */
function cleanupTest() {
  jest.restoreAllMocks();
}

module.exports = {
  createMockLogger,
  createMockDb,
  createMockCommons,
  createTestApp,
  setupRouteTest,
  cleanupTest,
};
