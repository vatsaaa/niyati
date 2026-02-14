// @niyati/auth-core — refreshTokens tests

describe('createRefreshTokenStore', () => {
  test('createRawToken produces a string', () => {
    const { createRawToken } = require('../lib/refreshTokens');
    const raw = createRawToken(12);
    expect(typeof raw).toBe('string');
    expect(raw.length).toBeGreaterThan(0);
  });

  test('hashToken produces 64-char hex SHA-256', () => {
    const { hashToken } = require('../lib/refreshTokens');
    const hashed = hashToken('testtoken');
    expect(hashed).toMatch(/^[0-9a-f]{64}$/);
  });

  test('store with default table name uses refresh_tokens', async () => {
    const { createRefreshTokenStore } = require('../lib/refreshTokens');
    const store = createRefreshTokenStore();
    const calls = [];
    const fakeDb = {
      async query(sql, params) {
        calls.push({ sql, params });
        return { rows: [{ id: 1, expires_at: params?.[2] }], rowCount: 1 };
      }
    };
    await store.storeRefreshToken(fakeDb, { userId: 1, tokenHash: 'h', expiresAt: new Date() });
    expect(calls[0].sql).toContain('refresh_tokens');
  });

  test('store with custom table name uses that name', async () => {
    const { createRefreshTokenStore } = require('../lib/refreshTokens');
    const store = createRefreshTokenStore({ tableName: 'my_tokens' });
    const calls = [];
    const fakeDb = {
      async query(sql, params) {
        calls.push({ sql, params });
        return { rows: [{ id: 1, expires_at: params?.[2] }], rowCount: 1 };
      }
    };
    await store.storeRefreshToken(fakeDb, { userId: 1, tokenHash: 'h', expiresAt: new Date() });
    expect(calls[0].sql).toContain('my_tokens');
    expect(calls[0].sql).not.toContain('refresh_tokens');
  });

  test('findByHash returns null when not found', async () => {
    const { createRefreshTokenStore } = require('../lib/refreshTokens');
    const store = createRefreshTokenStore();
    const fakeDb = { async query() { return { rows: [] }; } };
    const r = await store.findByHash(fakeDb, 'h');
    expect(r).toBeNull();
  });

  test('revoke marks token as revoked', async () => {
    const { createRefreshTokenStore } = require('../lib/refreshTokens');
    const store = createRefreshTokenStore();
    const fakeDb = { async query() { return { rowCount: 1 }; } };
    const ok = await store.revoke(fakeDb, 5);
    expect(ok).toBe(true);
  });

  test('rotate uses transaction with custom table name', async () => {
    const { createRefreshTokenStore } = require('../lib/refreshTokens');
    const store = createRefreshTokenStore({ tableName: 'app_tokens' });
    const calls = [];
    const fakeDb = {
      async query(sql, params) {
        calls.push({ sql, params });
        if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') return { rowCount: 0 };
        if (sql.startsWith('INSERT INTO')) return { rows: [{ id: 99, expires_at: params?.[2] }], rowCount: 1 };
        return { rowCount: 1 };
      }
    };
    const res = await store.rotate(fakeDb, { oldTokenId: 5, userId: 7, newTokenHash: 'abc', expiresAt: new Date() });
    expect(res).toHaveProperty('id', 99);
    expect(calls[0].sql).toBe('BEGIN');
    // Verify custom table name appears in the SQL
    const insertCall = calls.find(c => c.sql.includes('INSERT INTO'));
    expect(insertCall.sql).toContain('app_tokens');
  });

  test('throws without db', async () => {
    const { createRefreshTokenStore } = require('../lib/refreshTokens');
    const store = createRefreshTokenStore();
    await expect(store.storeRefreshToken(null, { userId: 1, tokenHash: 'h', expiresAt: new Date() }))
      .rejects.toThrow('Database client not configured');
  });

  test('revokeAllForUser revokes all tokens for a user', async () => {
    const { createRefreshTokenStore } = require('../lib/refreshTokens');
    const store = createRefreshTokenStore({ tableName: 'app_tokens' });
    const calls = [];
    const fakeDb = {
      async query(sql, params) {
        calls.push({ sql, params });
        return { rowCount: 3 };
      }
    };
    await store.revokeAllForUser(fakeDb, 42);
    expect(calls[0].sql).toContain('app_tokens');
    expect(calls[0].sql).toContain('revoked = true');
    expect(calls[0].params).toEqual([42]);
  });
});
