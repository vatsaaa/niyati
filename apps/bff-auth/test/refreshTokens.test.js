const { createRawToken, hashToken, storeRefreshToken, findRefreshTokenByHash, revokeRefreshToken, rotateRefreshToken } = require('../lib/refreshTokens');

describe('refreshTokens helpers', () => {
  test('createRawToken and hashToken produce expected formats', () => {
    const raw = createRawToken(12);
    expect(typeof raw).toBe('string');
    const hashed = hashToken('testtoken');
    // sha256 hex length 64
    expect(hashed).toMatch(/^[0-9a-f]{64}$/);
  });

  test('storeRefreshToken throws without db', async () => {
    await expect(storeRefreshToken(null, { userId: 1, tokenHash: 'h', expiresAt: new Date() })).rejects.toThrow('Database client not configured');
  });

  test('findRefreshTokenByHash throws without db', async () => {
    await expect(findRefreshTokenByHash(null, 'h')).rejects.toThrow('Database client not configured');
  });

  test('revokeRefreshToken throws without db', async () => {
    await expect(revokeRefreshToken(null, 1)).rejects.toThrow('Database client not configured');
  });

  test('rotateRefreshToken uses transaction and returns inserted row', async () => {
    const calls = [];
    const fakeDb = {
      async query(sql, params) {
        calls.push({ sql, params });
        if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') return { rowCount: 0 };
        if (sql.startsWith('INSERT INTO refresh_tokens')) {
          return { rows: [{ id: 123, expires_at: params[2] }], rowCount: 1 };
        }
        return { rowCount: 1 };
      }
    };

    const res = await rotateRefreshToken(fakeDb, { oldTokenId: 5, userId: 7, newTokenHash: 'abc', expiresAt: new Date() });
    expect(res).toHaveProperty('id', 123);
    // ensure BEGIN and COMMIT were called
    expect(calls[0].sql).toBe('BEGIN');
    expect(calls[calls.length - 2].sql.startsWith('INSERT INTO refresh_tokens')).toBeTruthy();
    expect(calls[calls.length - 1].sql).toBe('COMMIT');
  });
});
