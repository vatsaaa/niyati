const { createDailyRateLimiter } = require('@niyati/commons/lib/dailyRateLimiter');

describe('dailyRateLimiter', () => {
  test('free user allowed up to free limit then blocked', () => {
    const limiter = createDailyRateLimiter({ freeLimit: 5, paidLimit: 50, nowDateFn: () => new Date('2025-12-18T10:00:00Z') });
    const user = '+911234567890';
    for (let i = 1; i <= 5; i++) {
      const res = limiter.hit(user, { paid: false });
      expect(res.allowed).toBe(true);
      expect(res.used).toBe(i);
    }
    const blocked = limiter.hit(user, { paid: false });
    expect(blocked.allowed).toBe(false);
    expect(blocked.used).toBe(5);
  });

  test('paid user allowed up to paid limit then blocked', () => {
    const limiter = createDailyRateLimiter({ freeLimit: 5, paidLimit: 3, nowDateFn: () => new Date('2025-12-18T10:00:00Z') });
    const user = '+919999999999';
    for (let i = 1; i <= 3; i++) {
      const res = limiter.hit(user, { paid: true });
      expect(res.allowed).toBe(true);
      expect(res.used).toBe(i);
    }
    const blocked = limiter.hit(user, { paid: true });
    expect(blocked.allowed).toBe(false);
    expect(blocked.used).toBe(3);
  });

  test('resetAll clears counts', () => {
    const limiter = createDailyRateLimiter({ freeLimit: 2, paidLimit: 50, nowDateFn: () => new Date('2025-12-18T10:00:00Z') });
    const user = 'u1';
    limiter.hit(user, { paid: false });
    limiter.hit(user, { paid: false });
    expect(limiter.getUsage(user)).toBe(2);
    limiter.resetAll();
    expect(limiter.getUsage(user)).toBe(0);
  });
});
