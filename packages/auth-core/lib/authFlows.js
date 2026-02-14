/**
 * Auth flows factory — framework-agnostic business logic for common auth operations.
 *
 * Accepts injectable dependencies for JWT, token stores, user/OAuth repositories,
 * password hashing, email sending, social login, and validators. Returns pure
 * flow functions that return result objects ({ ok, ... } or { ok: false, code, message }).
 *
 * Usage:
 *   const { createAuthFlows } = require('@niyati/auth-core/lib/authFlows');
 *   const flows = createAuthFlows({ jwtProvider, refreshTokenStore, ... });
 *   const result = await flows.register(db, { email, password, name });
 *   if (!result.ok) handleError(result.code, result.message);
 */

function createAuthFlows({
  jwtProvider,
  refreshTokenStore,
  refreshTokenHelpers,
  passwordResetStore,
  passwordResetHelpers,
  passwordHasher,
  userRepo,
  oauthRepo,
  emailSender,
  socialLogin,
  validators,
  config = {},
}) {
  const refreshTokenTtlMs = config.refreshTokenTtlMs || 30 * 24 * 60 * 60 * 1000;
  const passwordResetTtlMs = config.passwordResetTtlMs || 60 * 60 * 1000;
  const replayWindowMs = config.replayWindowMs || 1000;
  const frontendBase = config.frontendBase || '';

  // Transaction helpers — PostgreSQL-compatible defaults, overridable for other DBs.
  const beginTx = config.beginTransaction || ((db) => db.query('BEGIN'));
  const commitTx = config.commit || ((db) => db.query('COMMIT'));
  const rollbackTx = config.rollback || ((db) => db.query('ROLLBACK'));

  // ── Internal ──

  async function createAndStoreRefresh(db, userId) {
    const raw = refreshTokenHelpers.createRawToken();
    const tokenHash = refreshTokenHelpers.hashToken(raw);
    const expiresAt = new Date(Date.now() + refreshTokenTtlMs);
    await refreshTokenStore.storeRefreshToken(db, { userId, tokenHash, expiresAt });
    return { raw, expiresAt };
  }

  // ── Flows ──

  async function register(db, { email, password, name } = {}) {
    if (!validators.isValidEmail(email)) {
      return { ok: false, code: 'VALIDATION_ERROR', message: 'Invalid email format' };
    }
    if (!validators.isValidPassword(password)) {
      return { ok: false, code: 'VALIDATION_ERROR', message: 'Password must be at least 8 characters' };
    }
    if (name && (typeof name !== 'string' || name.length > 100)) {
      return { ok: false, code: 'VALIDATION_ERROR', message: 'Name must be less than 100 characters' };
    }

    const normalizedEmail = email.toLowerCase().trim();
    const existing = await userRepo.findByEmail(db, normalizedEmail);
    if (existing) {
      return { ok: false, code: 'CONFLICT', message: 'Email already registered' };
    }

    const passwordHash = await passwordHasher.hash(password);
    const { id: userId } = await userRepo.create(db, {
      email: normalizedEmail,
      passwordHash,
      name: name ? name.trim() : null,
    });

    const { raw: refreshToken } = await createAndStoreRefresh(db, userId);
    const accessToken = jwtProvider.createAccessToken({ sub: userId });

    return { ok: true, userId, accessToken, refreshToken };
  }

  async function login(db, { email, password } = {}) {
    const invalidCredsMsg = 'Invalid email or password';

    if (!validators.isValidEmail(email) || !password) {
      return { ok: false, code: 'UNAUTHORIZED', message: invalidCredsMsg };
    }

    const user = await userRepo.findByEmail(db, email);
    const hashToCompare = user?.password_hash || passwordHasher.dummyHash;
    const ok = await passwordHasher.compare(password, hashToCompare);

    if (!user || !ok) {
      return { ok: false, code: 'UNAUTHORIZED', message: invalidCredsMsg };
    }

    const { raw: refreshToken } = await createAndStoreRefresh(db, user.id);
    const accessToken = jwtProvider.createAccessToken({ sub: user.id });

    // Non-blocking last-login update
    userRepo.updateLastLogin(db, user.id).catch(() => {});

    return { ok: true, userId: user.id, accessToken, refreshToken };
  }

  async function refreshToken(db, rawToken) {
    if (!rawToken || typeof rawToken !== 'string' || rawToken.length === 0) {
      return { ok: false, code: 'BAD_REQUEST', message: 'Invalid refresh token' };
    }
    if (rawToken.length > 500) {
      return { ok: false, code: 'BAD_REQUEST', message: 'Refresh token exceeds maximum length' };
    }

    const tokenHash = refreshTokenHelpers.hashToken(rawToken);
    const row = await refreshTokenStore.findByHash(db, tokenHash, true);
    const invalidMsg = 'Invalid or expired refresh token';

    if (!row) return { ok: false, code: 'UNAUTHORIZED', message: invalidMsg };

    if (row.revoked) {
      // Token reuse detected — revoke all for this user as a security measure
      try { await refreshTokenStore.revokeAllForUser(db, row.user_id); } catch (_) { /* best effort */ }
      return { ok: false, code: 'UNAUTHORIZED', message: invalidMsg };
    }

    if (new Date(row.expires_at) < new Date()) {
      return { ok: false, code: 'UNAUTHORIZED', message: invalidMsg };
    }

    // Replay detection
    if (row.last_used_at) {
      const timeSinceLastUse = Date.now() - new Date(row.last_used_at).getTime();
      if (timeSinceLastUse < replayWindowMs) {
        await refreshTokenStore.revokeAllForUser(db, row.user_id);
        return { ok: false, code: 'UNAUTHORIZED', message: invalidMsg };
      }
    }

    // Rotate — revoke old, issue new
    const newRaw = refreshTokenHelpers.createRawToken();
    const newHash = refreshTokenHelpers.hashToken(newRaw);
    const expiresAt = new Date(Date.now() + refreshTokenTtlMs);
    await refreshTokenStore.rotate(db, {
      oldTokenId: row.id, userId: row.user_id, newTokenHash: newHash, expiresAt,
    });

    const accessToken = jwtProvider.createAccessToken({ sub: row.user_id });
    return { ok: true, accessToken, refreshToken: newRaw, expiresIn: 15 * 60 };
  }

  async function logout(db, rawToken) {
    if (!rawToken || typeof rawToken !== 'string') {
      return { ok: false, code: 'BAD_REQUEST', message: 'Missing refresh token' };
    }

    const tokenHash = refreshTokenHelpers.hashToken(rawToken);
    const row = await refreshTokenStore.findByHash(db, tokenHash);
    if (!row) return { ok: true, revoked: false };

    await refreshTokenStore.revoke(db, row.id);
    return { ok: true, revoked: true };
  }

  async function requestPasswordReset(db, { email } = {}) {
    const alwaysSuccess = { ok: true, requested: true };

    if (!validators.isValidEmail(email)) return alwaysSuccess;

    const user = await userRepo.findByEmail(db, email);
    if (!user) return alwaysSuccess;

    // Throttle — skip if recently requested
    if (passwordResetStore.findRecent) {
      const recent = await passwordResetStore.findRecent(db, user.id, 5);
      if (recent) return alwaysSuccess;
    }

    const raw = passwordResetHelpers.createRawToken();
    const tokenHash = passwordResetHelpers.hashToken(raw);
    const expiresAt = new Date(Date.now() + passwordResetTtlMs);
    await passwordResetStore.storeReset(db, { userId: user.id, tokenHash, expiresAt });

    const resetUrl = `${frontendBase}/reset-password?token=${encodeURIComponent(raw)}`;

    // Non-blocking email send
    emailSender({
      to: user.email,
      subject: 'Password Reset Request',
      text: `Reset your password: ${resetUrl}\n\nThis link expires in 1 hour.`,
      html: `<p>Reset your password: <a href="${resetUrl}">${resetUrl}</a></p><p>This link expires in 1 hour.</p>`,
    }).catch(() => {});

    return alwaysSuccess;
  }

  async function resetPassword(db, { token, newPassword } = {}) {
    const invalidMsg = 'Invalid or expired reset token';

    if (!token || typeof token !== 'string') {
      return { ok: false, code: 'BAD_REQUEST', message: invalidMsg };
    }
    if (!validators.isValidPassword(newPassword)) {
      return { ok: false, code: 'VALIDATION_ERROR', message: 'Password must be at least 8 characters' };
    }

    const tokenHash = passwordResetHelpers.hashToken(token);
    const row = await passwordResetStore.findByHash(db, tokenHash);

    if (!row || row.used || new Date(row.expires_at) < new Date()) {
      return { ok: false, code: 'UNAUTHORIZED', message: invalidMsg };
    }

    await beginTx(db);
    try {
      const passwordHash = await passwordHasher.hash(newPassword);
      await userRepo.updatePassword(db, row.user_id, passwordHash);
      await passwordResetStore.markUsed(db, row.id);
      await refreshTokenStore.revokeAllForUser(db, row.user_id);
      await commitTx(db);
    } catch (err) {
      await rollbackTx(db);
      throw err;
    }

    return { ok: true, reset: true };
  }

  function validateAccessToken(token) {
    if (!token) {
      return { ok: false, code: 'UNAUTHORIZED', message: 'authentication_required' };
    }

    try {
      const payload = jwtProvider.verifyAccessToken(token);
      if (!payload || !payload.sub) {
        return { ok: false, code: 'UNAUTHORIZED', message: 'invalid_token_claims' };
      }
      return { ok: true, user: payload };
    } catch (err) {
      if (err.name === 'TokenExpiredError') {
        return { ok: false, code: 'UNAUTHORIZED', message: 'token_expired' };
      }
      return { ok: false, code: 'UNAUTHORIZED', message: 'invalid_access_token' };
    }
  }

  async function getCurrentUser(db, { accessToken, refreshTokenRaw } = {}) {
    // Try access token first
    if (accessToken) {
      try {
        const payload = jwtProvider.verifyAccessToken(accessToken);
        const user = await userRepo.findById(db, payload.sub);
        if (!user) return { ok: false, code: 'NOT_FOUND', message: 'User not found' };
        return { ok: true, user };
      } catch (_) {
        // Fall through to refresh token
      }
    }

    // Fallback: refresh token
    if (refreshTokenRaw) {
      const tokenHash = refreshTokenHelpers.hashToken(refreshTokenRaw);
      const row = await refreshTokenStore.findByHash(db, tokenHash);
      if (!row || row.revoked || new Date(row.expires_at) < new Date()) {
        return { ok: false, code: 'UNAUTHORIZED', message: 'Invalid or expired session' };
      }
      const user = await userRepo.findById(db, row.user_id);
      if (!user) return { ok: false, code: 'NOT_FOUND', message: 'User not found' };
      return { ok: true, user };
    }

    return { ok: false, code: 'UNAUTHORIZED', message: 'Missing authentication' };
  }

  async function oauthCallback(db, { provider, code, codeVerifier, redirectUri } = {}) {
    if (!provider || !code) {
      return { ok: false, code: 'BAD_REQUEST', message: 'provider and code required' };
    }

    const tokens = await socialLogin.handleCallback({ code, provider, codeVerifier, redirectUri });
    const userInfo = (await socialLogin.fetchUserInfo(provider, tokens)) || {};
    const providerId = userInfo.sub || userInfo.id || userInfo.user_id;
    const email = userInfo.email || null;
    const name = userInfo.name || userInfo.displayName || null;
    const avatar = userInfo.picture || userInfo.avatar_url || null;

    if (!providerId) {
      return { ok: false, code: 'BAD_REQUEST', message: 'Unable to determine provider user id' };
    }

    const existing = await oauthRepo.find(db, provider, providerId);
    let userId;

    await beginTx(db);
    try {
      if (existing) {
        userId = existing.user_id;
      } else {
        // Try to link to existing user by email
        if (email) {
          const byEmail = await userRepo.findByEmail(db, email);
          if (byEmail) userId = byEmail.id;
        }
        if (!userId) {
          const created = await userRepo.create(db, { email, name, avatar });
          userId = created.id;
        }
        await oauthRepo.create(db, {
          userId, provider, providerId,
          tokenMeta: tokens ? JSON.stringify(tokens) : null,
        });
      }

      const { raw: refreshRaw } = await createAndStoreRefresh(db, userId);
      const accessToken = jwtProvider.createAccessToken({ sub: userId });

      await commitTx(db);
      return { ok: true, userId, accessToken, refreshToken: refreshRaw };
    } catch (err) {
      await rollbackTx(db);
      throw err;
    }
  }

  async function linkProvider(db, { userId, provider, providerId, tokenMeta } = {}) {
    if (!provider || !providerId) {
      return { ok: false, code: 'BAD_REQUEST', message: 'provider and provider_id required' };
    }

    const existing = await oauthRepo.find(db, provider, providerId);
    if (existing) {
      return { ok: false, code: 'CONFLICT', message: 'Account already linked' };
    }

    const result = await oauthRepo.create(db, { userId, provider, providerId, tokenMeta: tokenMeta || null });
    return { ok: true, linked: true, id: result.id };
  }

  async function unlinkProvider(db, { userId, provider } = {}) {
    if (!provider) {
      return { ok: false, code: 'BAD_REQUEST', message: 'provider required' };
    }

    const otherCount = await oauthRepo.countOtherProviders(db, userId, provider);
    const hasPass = await userRepo.hasPassword(db, userId);

    if (otherCount === 0 && !hasPass) {
      return { ok: false, code: 'CONFLICT', message: 'Cannot unlink last sign-in method' };
    }

    await oauthRepo.delete(db, userId, provider);
    return { ok: true, unlinked: true };
  }

  return {
    register,
    login,
    refreshToken,
    logout,
    requestPasswordReset,
    resetPassword,
    validateAccessToken,
    getCurrentUser,
    oauthCallback,
    linkProvider,
    unlinkProvider,
  };
}

module.exports = { createAuthFlows };
