// @niyati/auth-core — oauth tests
const { generateCodeVerifier, generateCodeChallenge, generateState, getProviderConfig } = require('../lib/oauth');

describe('oauth helpers', () => {
  test('PKCE verifier and challenge', () => {
    const verifier = generateCodeVerifier(32);
    expect(typeof verifier).toBe('string');
    const challenge = generateCodeChallenge(verifier);
    expect(typeof challenge).toBe('string');
  });

  test('generateState produces hex string', () => {
    const s = generateState();
    expect(s).toMatch(/^[0-9a-f]+$/);
  });

  test('getProviderConfig reads env vars', () => {
    process.env.OAUTH_TEST_CLIENT_ID = 'cid';
    process.env.OAUTH_TEST_CLIENT_SECRET = 'csec';
    process.env.OAUTH_TEST_AUTHORIZE_URL = 'https://auth';
    process.env.OAUTH_TEST_TOKEN_URL = 'https://token';
    process.env.OAUTH_TEST_USERINFO_URL = 'https://user';
    process.env.OAUTH_TEST_SCOPES = 'openid profile';

    const cfg = getProviderConfig('test');
    expect(cfg.clientId).toBe('cid');
    expect(cfg.clientSecret).toBe('csec');
    expect(cfg.authorizeUrl).toBe('https://auth');
    expect(cfg.tokenUrl).toBe('https://token');
    expect(cfg.userInfoUrl).toBe('https://user');
    expect(cfg.scopes).toContain('openid');
    expect(cfg.scopes).toContain('profile');
  });

  test('getProviderConfig returns nulls for unconfigured provider', () => {
    const cfg = getProviderConfig('unconfigured');
    expect(cfg.clientId).toBeNull();
    expect(cfg.clientSecret).toBeNull();
  });
});
