// @niyati/auth-core — rateLimiter tests
const { createRateLimiter } = require('../lib/rateLimiter');

describe('createRateLimiter factory', () => {
  test('returns named limiters with custom config', () => {
    const limiters = createRateLimiter({
      general: { windowMs: 1000, loginMax: 2, registerMax: 3, passwordResetMax: 4 },
      strict: { windowMs: 500, tokenRefreshMax: 6 }
    });

    expect(limiters).toBeDefined();
    expect(typeof limiters.loginLimiter).toBe('function');
    expect(typeof limiters.registerLimiter).toBe('function');
    expect(typeof limiters.passwordResetLimiter).toBe('function');
    expect(typeof limiters.tokenRefreshLimiter).toBe('function');
  });

  test('returns limiters with default (empty) config', () => {
    const limiters = createRateLimiter();
    expect(typeof limiters.loginLimiter).toBe('function');
    expect(typeof limiters.registerLimiter).toBe('function');
  });

  test('creates independent instances per call', () => {
    const a = createRateLimiter({ general: { loginMax: 2 } });
    const b = createRateLimiter({ general: { loginMax: 10 } });
    expect(a.loginLimiter).not.toBe(b.loginLimiter);
  });
});
