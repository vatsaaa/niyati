const { createRawToken, hashToken, storePasswordReset, findByHash, markUsed } = require('../lib/passwordReset');

describe('passwordReset helpers', () => {
  test('createRawToken and hashToken', () => {
    const raw = createRawToken(8);
    expect(typeof raw).toBe('string');
    const hashed = hashToken('tok');
    expect(hashed).toMatch(/^[0-9a-f]{64}$/);
  });

  test('storePasswordReset delegates to db', async () => {
    const fakeDb = { async query(sql, params) { return { rows: [{ id: 11, expires_at: params[2] }], rowCount: 1 }; } };
    const r = await storePasswordReset(fakeDb, { userId: 2, tokenHash: 'h', expiresAt: new Date() });
    expect(r).toHaveProperty('id', 11);
  });

  test('findByHash returns null when not found', async () => {
    const fakeDb = { async query() { return { rows: [] }; } };
    const r = await findByHash(fakeDb, 'h');
    expect(r).toBeNull();
  });

  test('markUsed returns boolean', async () => {
    const fakeDb = { async query() { return { rowCount: 1 }; } };
    const ok = await markUsed(fakeDb, 5);
    expect(ok).toBe(true);
  });
});
