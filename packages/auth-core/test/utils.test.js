// @niyati/auth-core — utils tests
const { isValidEmail, isValidPassword, timingSafeEqual } = require('../lib/utils');

describe('utils', () => {
  describe('isValidEmail', () => {
    test('accepts valid email', () => {
      expect(isValidEmail('user@example.com')).toBe(true);
    });
    test('rejects null/undefined/empty', () => {
      expect(isValidEmail(null)).toBe(false);
      expect(isValidEmail(undefined)).toBe(false);
      expect(isValidEmail('')).toBe(false);
    });
    test('rejects non-string', () => {
      expect(isValidEmail(123)).toBe(false);
    });
    test('rejects malformed email', () => {
      expect(isValidEmail('not-an-email')).toBe(false);
      expect(isValidEmail('@missing.local')).toBe(false);
    });
    test('trims and lowercases before validation', () => {
      expect(isValidEmail('  User@EXAMPLE.COM  ')).toBe(true);
    });
  });

  describe('isValidPassword', () => {
    test('accepts 8+ char password', () => {
      expect(isValidPassword('abcdefgh')).toBe(true);
    });
    test('rejects short password', () => {
      expect(isValidPassword('abc')).toBe(false);
    });
    test('rejects null/empty', () => {
      expect(isValidPassword(null)).toBe(false);
      expect(isValidPassword('')).toBe(false);
    });
    test('rejects password over 128 chars', () => {
      expect(isValidPassword('a'.repeat(129))).toBe(false);
    });
  });

  describe('timingSafeEqual', () => {
    test('returns true for identical strings', () => {
      expect(timingSafeEqual('abc', 'abc')).toBe(true);
    });
    test('returns false for different strings', () => {
      expect(timingSafeEqual('abc', 'xyz')).toBe(false);
    });
    test('returns false for different lengths', () => {
      expect(timingSafeEqual('abc', 'abcd')).toBe(false);
    });
    test('returns false for non-string inputs', () => {
      expect(timingSafeEqual(null, 'abc')).toBe(false);
      expect(timingSafeEqual('abc', 123)).toBe(false);
    });
  });
});
