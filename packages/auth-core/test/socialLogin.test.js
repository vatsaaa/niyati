// @niyati/auth-core — socialLogin tests
describe('socialLogin', () => {
  test('redirects to provider (e.g. google)', () => {
    const { getProviderRedirect } = require('../lib/socialLogin');
    const url = getProviderRedirect('google');
    expect(typeof url).toBe('string');
    expect(url.length).toBeGreaterThan(0);
  });

  test('handles callback and returns token (stub)', async () => {
    const { handleCallback } = require('../lib/socialLogin');
    const token = await handleCallback({ code: 'fake-code' });
    expect(token).toBeDefined();
    expect(token.access_token).toBeDefined();
  });

  test('throws for unsupported provider', () => {
    const { getProviderRedirect } = require('../lib/socialLogin');
    expect(() => getProviderRedirect('unknown-provider')).toThrow('unsupported provider');
  });

  test('raw option returns object with state and codeVerifier', () => {
    const { getProviderRedirect } = require('../lib/socialLogin');
    const result = getProviderRedirect('google', { raw: true });
    expect(result).toHaveProperty('url');
    expect(result).toHaveProperty('state');
    expect(result).toHaveProperty('codeVerifier');
  });
});
