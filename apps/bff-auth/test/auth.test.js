const request = require('supertest');
const express = require('express');
const bcrypt = require('bcryptjs');

// ── Module-level mock objects (referenced by hoisted jest.mock factories) ──
// Variables starting with "mock" are specially hoisted by Jest's babel plugin.

const mockRefreshStore = {
  storeRefreshToken: jest.fn(async () => ({ id: 1, expires_at: new Date('2099-01-01') })),
  findByHash: jest.fn(async () => null),
  revoke: jest.fn(async () => true),
  rotate: jest.fn(async () => ({ id: 2, expires_at: new Date('2099-01-01') })),
  revokeAllForUser: jest.fn(async () => {}),
};

const mockPasswordResetStore = {
  storeReset: jest.fn(async () => ({ id: 1, expires_at: new Date('2099-01-01') })),
  findByHash: jest.fn(async () => null),
  markUsed: jest.fn(async () => true),
  findRecent: jest.fn(async () => null),
};

jest.mock('@niyati/commons/lib/logger', () => ({
  logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn(), fatal: jest.fn(), trace: jest.fn() },
}));

jest.mock('@niyati/auth-core/lib/refreshTokens', () => ({
  createRefreshTokenStore: () => mockRefreshStore,
  createRawToken: jest.fn(() => 'mock-raw-refresh'),
  hashToken: jest.fn(() => 'mock-refresh-hash'),
}));

jest.mock('@niyati/auth-core/lib/passwordReset', () => ({
  createPasswordResetStore: () => mockPasswordResetStore,
  createRawToken: jest.fn(() => 'mock-reset-raw'),
  hashToken: jest.fn(() => 'mock-reset-hash'),
}));

jest.mock('@niyati/auth-core/lib/emailProvider', () => ({
  sendMail: jest.fn(async () => {}),
  createEmailProvider: jest.fn(() => jest.fn(async () => {})),
}));

jest.mock('@niyati/auth-core/lib/socialLogin', () => ({
  handleCallback: jest.fn(async () => ({ access_token: 'oauth-at' })),
  fetchUserInfo: jest.fn(async () => ({ sub: 'g-123', email: 'o@t.com', name: 'O User' })),
  getProviderRedirect: jest.fn(() => 'https://provider.com/auth'),
}));

describe('auth routes', () => {
  let app;

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();

    process.env.ACCESS_TOKEN_SECRET = 'testsecret';
    process.env.BCRYPT_ROUNDS = '1';

    // Reset store mock defaults
    mockRefreshStore.storeRefreshToken.mockResolvedValue({ id: 1, expires_at: new Date('2099-01-01') });
    mockRefreshStore.findByHash.mockResolvedValue(null);
    mockRefreshStore.revoke.mockResolvedValue(true);
    mockRefreshStore.rotate.mockResolvedValue({ id: 2, expires_at: new Date('2099-01-01') });
    mockRefreshStore.revokeAllForUser.mockResolvedValue();
    mockPasswordResetStore.storeReset.mockResolvedValue({ id: 1, expires_at: new Date('2099-01-01') });
    mockPasswordResetStore.findByHash.mockResolvedValue(null);
    mockPasswordResetStore.markUsed.mockResolvedValue(true);
    mockPasswordResetStore.findRecent.mockResolvedValue(null);

    // Configure userRepo mock — set defaults via jest.mock manual approach
    const userRepo = require('../lib/userRepo');
    userRepo.findByEmail = jest.fn(async () => null);
    userRepo.create = jest.fn(async () => ({ id: 42 }));
    userRepo.findById = jest.fn(async () => null);
    userRepo.updatePassword = jest.fn(async () => {});
    userRepo.updateLastLogin = jest.fn(async () => {});
    userRepo.hasPassword = jest.fn(async () => false);

    const oauthRepo = require('../lib/oauthRepo');
    oauthRepo.find = jest.fn(async () => null);
    oauthRepo.create = jest.fn(async () => ({ id: 1 }));
    oauthRepo.delete = jest.fn(async () => {});
    oauthRepo.countOtherProviders = jest.fn(async () => 0);

    const authRouter = require('../lib/auth');

    app = express();
    app.use(express.json());
    const { attachResponseHelpers } = require('@niyati/commons/lib/responses');
    app.use('/api/v1/auth', attachResponseHelpers, authRouter);
    app.set('db', { query: jest.fn(async () => ({ rows: [], rowCount: 0 })) });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // ─── Register ──────────────────────────────────────

  test('POST /register succeeds for new user', async () => {
    const res = await request(app).post('/api/v1/auth/register').send({ email: 'a@b.com', password: 'strongpass', name: 'Test' });
    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.data).toHaveProperty('user_id', 42);
    expect(res.body.data).toHaveProperty('access_token');
  });

  test('POST /register conflicts when email exists', async () => {
    const userRepo = require('../lib/userRepo');
    userRepo.findByEmail.mockResolvedValue({ id: 1 });

    const res = await request(app).post('/api/v1/auth/register').send({ email: 'exists@b.com', password: 'strongpass' });
    expect(res.statusCode).toBe(409);
    expect(res.body.status).toBe('error');
  });

  // ─── Login ─────────────────────────────────────────

  test('POST /login succeeds with valid credentials', async () => {
    const passwordHash = bcrypt.hashSync('mypassword', 1);
    const userRepo = require('../lib/userRepo');
    userRepo.findByEmail.mockResolvedValue({ id: 7, password_hash: passwordHash });

    const res = await request(app).post('/api/v1/auth/login').send({ email: 'user@a.com', password: 'mypassword' });
    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.data).toHaveProperty('user_id', 7);
    expect(res.body.data).toHaveProperty('access_token');
  });

  test('POST /login fails with invalid creds', async () => {
    const res = await request(app).post('/api/v1/auth/login').send({ email: 'no@user', password: 'x' });
    expect(res.statusCode).toBe(401);
    expect(res.body.status).toBe('error');
  });

  // ─── Validate ──────────────────────────────────────

  test('POST /validate returns user for valid access token', async () => {
    const { createAccessToken } = require('@niyati/commons').auth;
    const token = createAccessToken({ sub: 'user-42', phone: '+911234567890' });

    const res = await request(app)
      .post('/api/v1/auth/validate')
      .set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.data).toHaveProperty('user');
    expect(res.body.data.user).toHaveProperty('sub', 'user-42');
    expect(res.body.data.user).toHaveProperty('phone', '+911234567890');
  });

  test('POST /validate returns 401 without token', async () => {
    const res = await request(app).post('/api/v1/auth/validate');
    expect(res.statusCode).toBe(401);
    expect(res.body.status).toBe('error');
  });

  test('POST /validate returns 401 for expired/invalid token', async () => {
    const res = await request(app)
      .post('/api/v1/auth/validate')
      .set('Authorization', 'Bearer invalid.token.here');
    expect(res.statusCode).toBe(401);
    expect(res.body.status).toBe('error');
  });
});
