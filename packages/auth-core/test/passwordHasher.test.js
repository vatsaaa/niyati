// @niyati/auth-core — passwordHasher tests

describe('createPasswordHasher', () => {
  test('hash produces a bcrypt-style string', async () => {
    const { createPasswordHasher } = require('../lib/passwordHasher');
    const hasher = createPasswordHasher({ rounds: 1 });
    const hashed = await hasher.hash('testpassword');
    expect(typeof hashed).toBe('string');
    expect(hashed.startsWith('$2')).toBe(true);
  });

  test('compare returns true for correct password', async () => {
    const { createPasswordHasher } = require('../lib/passwordHasher');
    const hasher = createPasswordHasher({ rounds: 1 });
    const hashed = await hasher.hash('myPass');
    const ok = await hasher.compare('myPass', hashed);
    expect(ok).toBe(true);
  });

  test('compare returns false for wrong password', async () => {
    const { createPasswordHasher } = require('../lib/passwordHasher');
    const hasher = createPasswordHasher({ rounds: 1 });
    const hashed = await hasher.hash('myPass');
    const ok = await hasher.compare('wrongPass', hashed);
    expect(ok).toBe(false);
  });

  test('dummyHash is a valid bcrypt-style string', () => {
    const { createPasswordHasher } = require('../lib/passwordHasher');
    const hasher = createPasswordHasher();
    expect(typeof hasher.dummyHash).toBe('string');
    expect(hasher.dummyHash.startsWith('$2')).toBe(true);
  });

  test('accepts custom hashFn and compareFn', async () => {
    const { createPasswordHasher } = require('../lib/passwordHasher');
    const customHash = jest.fn(async () => 'CUSTOM');
    const customCompare = jest.fn(async () => true);
    const hasher = createPasswordHasher({ hashFn: customHash, compareFn: customCompare });
    const h = await hasher.hash('x');
    expect(h).toBe('CUSTOM');
    expect(customHash).toHaveBeenCalledWith('x');
    const ok = await hasher.compare('x', 'CUSTOM');
    expect(ok).toBe(true);
    expect(customCompare).toHaveBeenCalledWith('x', 'CUSTOM');
  });
});
