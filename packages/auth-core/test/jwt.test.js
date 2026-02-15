// @niyati/auth-core — jwt tests
const jwt = require('jsonwebtoken');

describe('createJwtProvider', () => {
  const SECRET = 'test-jwt-secret-long-enough-for-hs256';

  test('createAccessToken signs a token with injected issuer/audience', () => {
    const { createJwtProvider } = require('../lib/jwt');
    const provider = createJwtProvider({
      secret: SECRET,
      issuer: 'my-app',
      audience: 'my-frontend'
    });

    const token = provider.createAccessToken({ sub: 42 });
    expect(typeof token).toBe('string');

    const decoded = jwt.verify(token, SECRET, { algorithms: ['HS256'] });
    expect(decoded.sub).toBe(42);
    expect(decoded.iss).toBe('my-app');
    expect(decoded.aud).toBe('my-frontend');
  });

  test('verifyAccessToken decodes a valid token', () => {
    const { createJwtProvider } = require('../lib/jwt');
    const provider = createJwtProvider({ secret: SECRET, issuer: 'x', audience: 'y' });

    const token = provider.createAccessToken({ sub: 7 });
    const payload = provider.verifyAccessToken(token);
    expect(payload.sub).toBe(7);
  });

  test('verifyAccessToken throws on invalid token', () => {
    const { createJwtProvider } = require('../lib/jwt');
    const provider = createJwtProvider({ secret: SECRET });
    expect(() => provider.verifyAccessToken('garbage.token.here')).toThrow();
  });

  test('createAccessToken throws when secret is missing', () => {
    const { createJwtProvider } = require('../lib/jwt');
    const provider = createJwtProvider({ secret: null });
    expect(() => provider.createAccessToken({ sub: 1 })).toThrow('secret not configured');
  });

  test('defaults: algorithm HS256, expiresIn 24h, no issuer/audience', () => {
    const { createJwtProvider } = require('../lib/jwt');
    const provider = createJwtProvider({ secret: SECRET });

    const token = provider.createAccessToken({ sub: 99 });
    const decoded = jwt.decode(token, { complete: true });
    expect(decoded.header.alg).toBe('HS256');
    expect(decoded.payload.sub).toBe(99);
    // exp should be 24 hours from now
    const diff = decoded.payload.exp - decoded.payload.iat;
    expect(diff).toBe(24 * 60 * 60);
  });

  test('expiresIn can be overridden per-call', () => {
    const { createJwtProvider } = require('../lib/jwt');
    const provider = createJwtProvider({ secret: SECRET, expiresIn: '1h' });

    const token = provider.createAccessToken({ sub: 1 }, { expiresIn: '30s' });
    const decoded = jwt.decode(token);
    const diff = decoded.exp - decoded.iat;
    expect(diff).toBe(30);
  });

  test('validateAuthConfig warns when secret is missing', () => {
    const { createJwtProvider } = require('../lib/jwt');
    const provider = createJwtProvider({ secret: undefined });
    const origWarn = console.warn;
    const warns = [];
    console.warn = (...args) => warns.push(args.join(' '));
    provider.validateAuthConfig();
    console.warn = origWarn;
    expect(warns.length).toBeGreaterThan(0);
    expect(warns[0]).toMatch(/secret/i);
  });
});
