import { describe, it, expect } from 'vitest';
import { validateNormalizedDate } from '../normalizers';

describe('validateNormalizedDate', () => {
  it('returns valid for a normal past date', () => {
    const result = validateNormalizedDate('1979-05-19');
    expect(result.valid).toBe(true);
  });

  it('returns error for impossible date (Feb 31)', () => {
    const result = validateNormalizedDate('1979-02-31');
    expect(result.valid).toBe(false);
    expect(result.message).toMatch(/doesn.*exist/i);
  });

  it('returns error for future date', () => {
    const result = validateNormalizedDate('2030-03-15');
    expect(result.valid).toBe(false);
    expect(result.message).toMatch(/future/i);
  });

  it('returns valid for null/empty (optional field)', () => {
    expect(validateNormalizedDate(null).valid).toBe(true);
    expect(validateNormalizedDate('').valid).toBe(true);
  });

  it('returns error for invalid month 13', () => {
    const result = validateNormalizedDate('1979-13-01');
    expect(result.valid).toBe(false);
  });
});
