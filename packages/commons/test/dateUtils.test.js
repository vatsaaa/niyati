const { computeIsAdult, computeAge, isValidDate, isFutureDate, validateDateOfBirth } = require('../lib/dateUtils');

describe('dateUtils', () => {
  describe('computeAge', () => {
    test('returns correct age for past date', () => {
      // Person born exactly 25 years ago
      const now = new Date();
      const dob = new Date(now.getFullYear() - 25, now.getMonth(), now.getDate());
      expect(computeAge(dob.toISOString().split('T')[0])).toBe(25);
    });

    test('returns null for null/undefined input', () => {
      expect(computeAge(null)).toBeNull();
      expect(computeAge(undefined)).toBeNull();
      expect(computeAge('')).toBeNull();
    });

    test('returns null for invalid date string', () => {
      expect(computeAge('not-a-date')).toBeNull();
    });
  });

  describe('computeIsAdult (age >= 13 threshold)', () => {
    test('returns true for age >= 13', () => {
      const now = new Date();
      const dob13 = new Date(now.getFullYear() - 13, now.getMonth(), now.getDate());
      expect(computeIsAdult(dob13.toISOString().split('T')[0])).toBe(true);
    });

    test('returns true for age 18', () => {
      const now = new Date();
      const dob18 = new Date(now.getFullYear() - 18, now.getMonth(), now.getDate());
      expect(computeIsAdult(dob18.toISOString().split('T')[0])).toBe(true);
    });

    test('returns false for age < 13', () => {
      // A 10-year-old should definitely not be considered adult
      const now = new Date();
      const dob = new Date(now.getFullYear() - 10, now.getMonth(), now.getDate());
      expect(computeIsAdult(dob.toISOString().split('T')[0])).toBe(false);
    });

    test('returns null for null/invalid input', () => {
      expect(computeIsAdult(null)).toBeNull();
      expect(computeIsAdult('garbage')).toBeNull();
    });
  });

  describe('isValidDate', () => {
    test('returns true for valid dates', () => {
      expect(isValidDate('2000-01-15')).toBe(true);
      expect(isValidDate('1979-05-19')).toBe(true);
    });

    test('returns false for Feb 31', () => {
      expect(isValidDate('1979-02-31')).toBe(false);
    });

    test('returns false for invalid month', () => {
      expect(isValidDate('1979-13-01')).toBe(false);
    });

    test('returns false for null/empty/garbage', () => {
      expect(isValidDate(null)).toBe(false);
      expect(isValidDate('')).toBe(false);
      expect(isValidDate('not-a-date')).toBe(false);
    });

    test('returns false for Feb 29 in non-leap year', () => {
      expect(isValidDate('2023-02-29')).toBe(false);
    });

    test('returns true for Feb 29 in leap year', () => {
      expect(isValidDate('2024-02-29')).toBe(true);
    });
  });

  describe('isFutureDate', () => {
    test('returns true for future date', () => {
      expect(isFutureDate('2099-01-01')).toBe(true);
    });

    test('returns false for past date', () => {
      expect(isFutureDate('1979-05-19')).toBe(false);
    });

    test('returns false for null/invalid', () => {
      expect(isFutureDate(null)).toBe(false);
      expect(isFutureDate('garbage')).toBe(false);
    });
  });

  describe('validateDateOfBirth', () => {
    test('returns { valid: true } for a valid past DOB of age >= 13', () => {
      const result = validateDateOfBirth('1979-05-19');
      expect(result.valid).toBe(true);
    });

    test('returns invalid_date error for Feb 31', () => {
      const result = validateDateOfBirth('1979-02-31');
      expect(result.valid).toBe(false);
      expect(result.code).toBe('PROFILE_002');
      expect(result.message).toMatch(/doesn.*exist/i);
    });

    test('returns future_date error for 2030 date', () => {
      const result = validateDateOfBirth('2030-03-15');
      expect(result.valid).toBe(false);
      expect(result.code).toBe('PROFILE_002');
      expect(result.message).toMatch(/future/i);
    });

    test('returns underage error for age < 13', () => {
      const now = new Date();
      const dob = new Date(now.getFullYear() - 10, now.getMonth(), now.getDate());
      const result = validateDateOfBirth(dob.toISOString().split('T')[0]);
      expect(result.valid).toBe(false);
      expect(result.code).toBe('PROFILE_003');
      expect(result.message).toMatch(/13/);
    });

    test('returns { valid: true } for null/empty (not required by this function)', () => {
      // validateDateOfBirth only validates when a date IS provided
      expect(validateDateOfBirth(null).valid).toBe(true);
      expect(validateDateOfBirth('').valid).toBe(true);
    });
  });
});
