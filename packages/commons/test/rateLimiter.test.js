const { createRateLimiter } = require('../lib/rateLimiter');

describe('createRateLimiter factory', () => {
  test('returns named limiters and is repeatable', () => {
    const limiters = createRateLimiter({
      general: { windowMs: 1000, loginMax: 2, registerMax: 3, passwordResetMax: 4 },
      strict: { windowMs: 500, tokenRefreshMax: 6 }
    });

    expect(limiters).toBeDefined();
    expect(typeof limiters.loginLimiter).toBe('function');
    expect(typeof limiters.registerLimiter).toBe('function');
    expect(typeof limiters.passwordResetLimiter).toBe('function');
    expect(typeof limiters.tokenRefreshLimiter).toBe('function');

    // calling twice returns independent middleware instances
    const other = createRateLimiter({ general: { loginMax: 10 } });
    expect(other).toBeDefined();
    expect(other.loginLimiter).not.toBe(limiters.loginLimiter);
  });
});
