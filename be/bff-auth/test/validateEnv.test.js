const ORIGINAL_ENV = process.env;

describe('validateEnv', () => {
  let loggerMock;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...ORIGINAL_ENV };
    // place the mock on global so jest.mock factory can reference it safely
    global.loggerMock = {
      warn: jest.fn(),
      fatal: jest.fn(),
      info: jest.fn()
    };
    loggerMock = global.loggerMock;
    jest.mock('../commons/lib/logger', () => ({ logger: global.loggerMock }));
  });

  afterEach(() => {
    process.env = ORIGINAL_ENV;
    jest.restoreAllMocks();
  });

  test('exits when required env vars are missing', () => {
    // clear required vars
    delete process.env.PORT;
    delete process.env.ASTRO_API_URL;
    delete process.env.ASTRO_API_KEY;

    // spy on process.exit to prevent test runner from exiting
    const exitSpy = jest.spyOn(process, 'exit').mockImplementation(code => {
      throw new Error('process.exit:' + code);
    });

    const { validateEnv } = require('../lib/validateEnv');

    expect(() => validateEnv()).toThrow(/process.exit:1/);
    expect(loggerMock.fatal).toHaveBeenCalled();
    exitSpy.mockRestore();
  });

  test('passes when required env vars are present and valid', () => {
    process.env.PORT = '3000';
    process.env.ASTRO_API_URL = 'https://api.example.com';
    process.env.ASTRO_API_KEY = 'abc123';
    process.env.NODE_ENV = 'test';

    const { validateEnv } = require('../lib/validateEnv');

    // Should not throw
    expect(() => validateEnv()).not.toThrow();
    expect(loggerMock.info).toHaveBeenCalled();
  });
});
