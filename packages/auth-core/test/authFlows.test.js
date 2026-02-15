// @niyati/auth-core — authFlows tests

const { createAuthFlows } = require('../lib/authFlows');

function createMockDeps(overrides = {}) {
  const deps = {
    jwtProvider: {
      createAccessToken: jest.fn(() => 'mock-access-token'),
      verifyAccessToken: jest.fn(() => ({ sub: 1, iat: 1000, exp: 2000 })),
    },
    refreshTokenStore: {
      storeRefreshToken: jest.fn(async () => ({ id: 1, expires_at: new Date('2099-01-01') })),
      findByHash: jest.fn(async () => null),
      revoke: jest.fn(async () => true),
      rotate: jest.fn(async () => ({ id: 2, expires_at: new Date('2099-01-01') })),
      revokeAllForUser: jest.fn(async () => {}),
    },
    refreshTokenHelpers: {
      createRawToken: jest.fn(() => 'mock-raw-refresh'),
      hashToken: jest.fn(() => 'mock-refresh-hash'),
    },
    passwordResetStore: {
      storeReset: jest.fn(async () => ({ id: 1, expires_at: new Date('2099-01-01') })),
      findByHash: jest.fn(async () => null),
      markUsed: jest.fn(async () => true),
      findRecent: jest.fn(async () => null),
    },
    passwordResetHelpers: {
      createRawToken: jest.fn(() => 'mock-raw-reset'),
      hashToken: jest.fn(() => 'mock-reset-hash'),
    },
    passwordHasher: {
      hash: jest.fn(async () => '$2b$10$hashed'),
      compare: jest.fn(async () => true),
      dummyHash: '$2b$10$dummy',
    },
    userRepo: {
      findByEmail: jest.fn(async () => null),
      create: jest.fn(async () => ({ id: 42 })),
      findById: jest.fn(async () => ({ id: 42, email: 'user@test.com', name: 'Test User' })),
      updatePassword: jest.fn(async () => {}),
      updateLastLogin: jest.fn(async () => {}),
      hasPassword: jest.fn(async () => false),
    },
    oauthRepo: {
      find: jest.fn(async () => null),
      create: jest.fn(async () => ({ id: 1 })),
      delete: jest.fn(async () => {}),
      countOtherProviders: jest.fn(async () => 0),
    },
    emailSender: jest.fn(async () => {}),
    socialLogin: {
      handleCallback: jest.fn(async () => ({ access_token: 'oauth-at' })),
      fetchUserInfo: jest.fn(async () => ({ sub: 'google-123', email: 'oauth@test.com', name: 'OAuth User' })),
    },
    validators: {
      isValidEmail: jest.fn(() => true),
      isValidPassword: jest.fn(() => true),
    },
    config: {},
  };
  return { ...deps, ...overrides };
}

function mockDb() {
  return { query: jest.fn(async () => ({ rows: [], rowCount: 0 })) };
}

describe('createAuthFlows', () => {
  let deps, db, flows;

  beforeEach(() => {
    deps = createMockDeps();
    db = mockDb();
    flows = createAuthFlows(deps);
  });

  // ─── register ──────────────────────────────────────

  describe('register', () => {
    test('creates user and returns tokens', async () => {
      const result = await flows.register(db, { email: 'new@test.com', password: 'Str0ngP@ss', name: 'New User' });
      expect(result.ok).toBe(true);
      expect(result.userId).toBe(42);
      expect(result.accessToken).toBe('mock-access-token');
      expect(result.refreshToken).toBe('mock-raw-refresh');
      expect(deps.passwordHasher.hash).toHaveBeenCalledWith('Str0ngP@ss');
      expect(deps.userRepo.create).toHaveBeenCalled();
    });

    test('rejects invalid email', async () => {
      deps.validators.isValidEmail.mockReturnValue(false);
      const result = await flows.register(db, { email: 'bad', password: 'Str0ngP@ss' });
      expect(result.ok).toBe(false);
      expect(result.code).toBe('VALIDATION_ERROR');
    });

    test('rejects weak password', async () => {
      deps.validators.isValidPassword.mockReturnValue(false);
      const result = await flows.register(db, { email: 'a@b.com', password: '123' });
      expect(result.ok).toBe(false);
      expect(result.code).toBe('VALIDATION_ERROR');
    });

    test('rejects duplicate email', async () => {
      deps.userRepo.findByEmail.mockResolvedValue({ id: 99 });
      const result = await flows.register(db, { email: 'exists@test.com', password: 'Str0ngP@ss' });
      expect(result.ok).toBe(false);
      expect(result.code).toBe('CONFLICT');
    });

    test('rejects long name', async () => {
      const result = await flows.register(db, { email: 'a@b.com', password: 'Str0ngP@ss', name: 'x'.repeat(101) });
      expect(result.ok).toBe(false);
      expect(result.code).toBe('VALIDATION_ERROR');
    });
  });

  // ─── login ─────────────────────────────────────────

  describe('login', () => {
    test('returns tokens on success', async () => {
      deps.userRepo.findByEmail.mockResolvedValue({ id: 7, password_hash: '$2b$10$hash' });
      const result = await flows.login(db, { email: 'user@test.com', password: 'pass123' });
      expect(result.ok).toBe(true);
      expect(result.userId).toBe(7);
      expect(result.accessToken).toBe('mock-access-token');
      expect(deps.userRepo.updateLastLogin).toHaveBeenCalledWith(db, 7);
    });

    test('rejects invalid credentials', async () => {
      deps.passwordHasher.compare.mockResolvedValue(false);
      deps.userRepo.findByEmail.mockResolvedValue({ id: 7, password_hash: '$2b$10$hash' });
      const result = await flows.login(db, { email: 'user@test.com', password: 'wrong' });
      expect(result.ok).toBe(false);
      expect(result.code).toBe('UNAUTHORIZED');
    });

    test('uses dummy hash when user not found (timing attack prevention)', async () => {
      deps.userRepo.findByEmail.mockResolvedValue(null);
      deps.passwordHasher.compare.mockResolvedValue(false);
      const result = await flows.login(db, { email: 'noone@test.com', password: 'pass' });
      expect(result.ok).toBe(false);
      expect(deps.passwordHasher.compare).toHaveBeenCalledWith('pass', deps.passwordHasher.dummyHash);
    });
  });

  // ─── refreshToken ──────────────────────────────────

  describe('refreshToken (rotate)', () => {
    const validRow = { id: 10, user_id: 5, revoked: false, expires_at: new Date('2099-01-01'), last_used_at: null };

    test('rotates token and returns new tokens', async () => {
      deps.refreshTokenStore.findByHash.mockResolvedValue(validRow);
      const result = await flows.refreshToken(db, 'valid-raw-token');
      expect(result.ok).toBe(true);
      expect(result.accessToken).toBe('mock-access-token');
      expect(result.refreshToken).toBe('mock-raw-refresh');
      expect(deps.refreshTokenStore.rotate).toHaveBeenCalled();
    });

    test('rejects missing token', async () => {
      const result = await flows.refreshToken(db, '');
      expect(result.ok).toBe(false);
      expect(result.code).toBe('BAD_REQUEST');
    });

    test('revokes all tokens when revoked token is reused', async () => {
      deps.refreshTokenStore.findByHash.mockResolvedValue({ ...validRow, revoked: true });
      const result = await flows.refreshToken(db, 'revoked-token');
      expect(result.ok).toBe(false);
      expect(result.code).toBe('UNAUTHORIZED');
      expect(deps.refreshTokenStore.revokeAllForUser).toHaveBeenCalledWith(db, 5);
    });

    test('rejects expired token', async () => {
      deps.refreshTokenStore.findByHash.mockResolvedValue({ ...validRow, expires_at: new Date('2000-01-01') });
      const result = await flows.refreshToken(db, 'expired-token');
      expect(result.ok).toBe(false);
      expect(result.code).toBe('UNAUTHORIZED');
    });
  });

  // ─── logout ────────────────────────────────────────

  describe('logout', () => {
    test('revokes refresh token', async () => {
      deps.refreshTokenStore.findByHash.mockResolvedValue({ id: 10 });
      const result = await flows.logout(db, 'valid-raw-token');
      expect(result.ok).toBe(true);
      expect(result.revoked).toBe(true);
      expect(deps.refreshTokenStore.revoke).toHaveBeenCalledWith(db, 10);
    });

    test('returns revoked:false when token not found', async () => {
      const result = await flows.logout(db, 'unknown-token');
      expect(result.ok).toBe(true);
      expect(result.revoked).toBe(false);
    });
  });

  // ─── requestPasswordReset ──────────────────────────

  describe('requestPasswordReset', () => {
    test('creates reset token and sends email', async () => {
      deps.userRepo.findByEmail.mockResolvedValue({ id: 3, email: 'u@t.com' });
      const result = await flows.requestPasswordReset(db, { email: 'u@t.com' });
      expect(result.ok).toBe(true);
      expect(result.requested).toBe(true);
      expect(deps.passwordResetStore.storeReset).toHaveBeenCalled();
      expect(deps.emailSender).toHaveBeenCalled();
    });

    test('returns success even if user not found (no enumeration)', async () => {
      deps.userRepo.findByEmail.mockResolvedValue(null);
      const result = await flows.requestPasswordReset(db, { email: 'noone@t.com' });
      expect(result.ok).toBe(true);
      expect(result.requested).toBe(true);
      expect(deps.emailSender).not.toHaveBeenCalled();
    });
  });

  // ─── resetPassword ─────────────────────────────────

  describe('resetPassword', () => {
    const validReset = { id: 1, user_id: 5, used: false, expires_at: new Date('2099-01-01') };

    test('resets password and revokes all tokens', async () => {
      deps.passwordResetStore.findByHash.mockResolvedValue(validReset);
      const result = await flows.resetPassword(db, { token: 'reset-raw', newPassword: 'NewStr0ng!' });
      expect(result.ok).toBe(true);
      expect(result.reset).toBe(true);
      expect(deps.userRepo.updatePassword).toHaveBeenCalledWith(db, 5, '$2b$10$hashed');
      expect(deps.passwordResetStore.markUsed).toHaveBeenCalledWith(db, 1);
      expect(deps.refreshTokenStore.revokeAllForUser).toHaveBeenCalledWith(db, 5);
    });

    test('rejects invalid/expired reset token', async () => {
      deps.passwordResetStore.findByHash.mockResolvedValue(null);
      const result = await flows.resetPassword(db, { token: 'bad', newPassword: 'NewStr0ng!' });
      expect(result.ok).toBe(false);
      expect(result.code).toBe('UNAUTHORIZED');
    });
  });

  // ─── validateAccessToken ───────────────────────────

  describe('validateAccessToken', () => {
    test('returns user payload on valid token', () => {
      const result = flows.validateAccessToken('good-token');
      expect(result.ok).toBe(true);
      expect(result.user.sub).toBe(1);
    });

    test('rejects missing token', () => {
      const result = flows.validateAccessToken('');
      expect(result.ok).toBe(false);
      expect(result.code).toBe('UNAUTHORIZED');
    });
  });

  // ─── getCurrentUser ────────────────────────────────

  describe('getCurrentUser', () => {
    test('returns user via access token', async () => {
      deps.userRepo.findById.mockResolvedValue({ id: 1, email: 'u@t.com', name: 'User' });
      const result = await flows.getCurrentUser(db, { accessToken: 'good-at' });
      expect(result.ok).toBe(true);
      expect(result.user.email).toBe('u@t.com');
    });

    test('returns user via refresh token', async () => {
      deps.jwtProvider.verifyAccessToken.mockImplementation(() => { throw new Error('expired'); });
      deps.refreshTokenStore.findByHash.mockResolvedValue({ id: 1, user_id: 5, revoked: false, expires_at: new Date('2099-01-01') });
      deps.userRepo.findById.mockResolvedValue({ id: 5, email: 'u@t.com' });
      const result = await flows.getCurrentUser(db, { refreshTokenRaw: 'rt-raw' });
      expect(result.ok).toBe(true);
      expect(result.user.id).toBe(5);
    });

    test('rejects when no auth provided', async () => {
      const result = await flows.getCurrentUser(db, {});
      expect(result.ok).toBe(false);
      expect(result.code).toBe('UNAUTHORIZED');
    });
  });

  // ─── oauthCallback ─────────────────────────────────

  describe('oauthCallback', () => {
    test('returns tokens for existing oauth user', async () => {
      deps.oauthRepo.find.mockResolvedValue({ user_id: 10 });
      const result = await flows.oauthCallback(db, { provider: 'google', code: 'abc' });
      expect(result.ok).toBe(true);
      expect(result.userId).toBe(10);
      expect(result.accessToken).toBe('mock-access-token');
    });

    test('creates new user for unknown oauth user', async () => {
      deps.oauthRepo.find.mockResolvedValue(null);
      deps.userRepo.findByEmail.mockResolvedValue(null);
      deps.userRepo.create.mockResolvedValue({ id: 55 });
      const result = await flows.oauthCallback(db, { provider: 'google', code: 'abc' });
      expect(result.ok).toBe(true);
      expect(result.userId).toBe(55);
      expect(deps.oauthRepo.create).toHaveBeenCalled();
    });
  });

  // ─── linkProvider ──────────────────────────────────

  describe('linkProvider', () => {
    test('links provider to user', async () => {
      deps.oauthRepo.create.mockResolvedValue({ id: 7 });
      const result = await flows.linkProvider(db, { userId: 1, provider: 'github', providerId: 'gh-123' });
      expect(result.ok).toBe(true);
      expect(result.linked).toBe(true);
      expect(result.id).toBe(7);
    });

    test('rejects duplicate link', async () => {
      deps.oauthRepo.find.mockResolvedValue({ id: 5, user_id: 99 });
      const result = await flows.linkProvider(db, { userId: 1, provider: 'github', providerId: 'gh-123' });
      expect(result.ok).toBe(false);
      expect(result.code).toBe('CONFLICT');
    });
  });

  // ─── unlinkProvider ────────────────────────────────

  describe('unlinkProvider', () => {
    test('unlinks provider', async () => {
      deps.oauthRepo.countOtherProviders.mockResolvedValue(1);
      const result = await flows.unlinkProvider(db, { userId: 1, provider: 'github' });
      expect(result.ok).toBe(true);
      expect(result.unlinked).toBe(true);
    });

    test('blocks unlink of last sign-in method', async () => {
      deps.oauthRepo.countOtherProviders.mockResolvedValue(0);
      deps.userRepo.hasPassword.mockResolvedValue(false);
      const result = await flows.unlinkProvider(db, { userId: 1, provider: 'github' });
      expect(result.ok).toBe(false);
      expect(result.code).toBe('CONFLICT');
    });
  });
});
