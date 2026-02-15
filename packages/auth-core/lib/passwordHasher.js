/**
 * Password hasher factory — bcryptjs wrapper with injectable hash/compare.
 *
 * Usage:
 *   const { createPasswordHasher } = require('@niyati/auth-core/lib/passwordHasher');
 *   const hasher = createPasswordHasher({ rounds: 10 });
 *   const hashed = await hasher.hash('password');
 *   const ok = await hasher.compare('password', hashed);
 */

const bcrypt = require('bcryptjs');

function createPasswordHasher({ rounds = 10, hashFn, compareFn } = {}) {
  const hash = hashFn || (async (password) => bcrypt.hash(password, rounds));
  const compare = compareFn || (async (password, storedHash) => bcrypt.compare(password, storedHash));

  // Dummy hash for timing-attack prevention when user not found.
  // Must be a valid bcrypt string so bcrypt.compare does constant-time work.
  const dummyHash = '$2b$10$invalidhashfortimingatttackprevention';

  return { hash, compare, dummyHash };
}

module.exports = { createPasswordHasher };
