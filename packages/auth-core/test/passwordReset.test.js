// @niyati/auth-core — passwordReset tests

describe('createPasswordResetStore', () => {
  test('createRawToken produces a string', () => {
    const { createRawToken } = require('../lib/passwordReset');
    const raw = createRawToken(8);
    expect(typeof raw).toBe('string');
  });

  test('hashToken produces 64-char hex SHA-256', () => {
    const { hashToken } = require('../lib/passwordReset');
    const hashed = hashToken('tok');
    expect(hashed).toMatch(/^[0-9a-f]{64}$/);
  });

  test('store with default table name uses password_resets', async () => {
    const { createPasswordResetStore } = require('../lib/passwordReset');
    const store = createPasswordResetStore();
    const calls = [];
    const fakeDb = {
      async query(sql, params) {
        calls.push({ sql, params });
        return { rows: [{ id: 11, expires_at: params?.[2] }], rowCount: 1 };
      }
    };
    await store.storeReset(fakeDb, { userId: 2, tokenHash: 'h', expiresAt: new Date() });
    expect(calls[0].sql).toContain('password_resets');
  });

  test('store with custom table name uses that name', async () => {
    const { createPasswordResetStore } = require('../lib/passwordReset');
    const store = createPasswordResetStore({ tableName: 'my_resets' });
    const calls = [];
    const fakeDb = {
      async query(sql, params) {
        calls.push({ sql, params });
        return { rows: [{ id: 11, expires_at: params?.[2] }], rowCount: 1 };
      }
    };
    await store.storeReset(fakeDb, { userId: 2, tokenHash: 'h', expiresAt: new Date() });
    expect(calls[0].sql).toContain('my_resets');
    expect(calls[0].sql).not.toContain('password_resets');
  });

  test('findByHash returns null when not found', async () => {
    const { createPasswordResetStore } = require('../lib/passwordReset');
    const store = createPasswordResetStore();
    const fakeDb = { async query() { return { rows: [] }; } };
    const r = await store.findByHash(fakeDb, 'h');
    expect(r).toBeNull();
  });

  test('markUsed returns boolean', async () => {
    const { createPasswordResetStore } = require('../lib/passwordReset');
    const store = createPasswordResetStore();
    const fakeDb = { async query() { return { rowCount: 1 }; } };
    const ok = await store.markUsed(fakeDb, 5);
    expect(ok).toBe(true);
  });

  test('findRecent returns null when no recent reset', async () => {
    const { createPasswordResetStore } = require('../lib/passwordReset');
    const store = createPasswordResetStore();
    const fakeDb = { async query() { return { rows: [] }; } };
    const r = await store.findRecent(fakeDb, 1, 5);
    expect(r).toBeNull();
  });

  test('findRecent returns row when recent reset exists', async () => {
    const { createPasswordResetStore } = require('../lib/passwordReset');
    const store = createPasswordResetStore({ tableName: 'my_resets' });
    const calls = [];
    const fakeDb = {
      async query(sql, params) {
        calls.push({ sql, params });
        return { rows: [{ id: 5 }] };
      }
    };
    const r = await store.findRecent(fakeDb, 3, 10);
    expect(r).toEqual({ id: 5 });
    expect(calls[0].sql).toContain('my_resets');
    expect(calls[0].params[0]).toBe(3);
  });
});
