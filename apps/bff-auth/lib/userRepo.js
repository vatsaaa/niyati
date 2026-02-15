/**
 * SQL-based user repository for niyati.
 * Implements the userRepo interface expected by @niyati/auth-core's createAuthFlows.
 *
 * Every function takes `db` (pg client with `query`) as the first argument so
 * callers can control connection/transaction scope.
 */

async function findByEmail(db, email) {
  const res = await db.query(
    'SELECT id, password_hash, email, name, avatar_url, created_at, updated_at, last_login FROM users WHERE lower(email) = lower($1) LIMIT 1',
    [email]
  );
  return res.rows[0] || null;
}

async function create(db, { email, passwordHash, name, avatar }) {
  const res = await db.query(
    'INSERT INTO users (email, password_hash, name, avatar_url, created_at, updated_at) VALUES ($1, $2, $3, $4, now(), now()) RETURNING id',
    [email, passwordHash || null, name || null, avatar || null]
  );
  return res.rows[0];
}

async function findById(db, id) {
  const res = await db.query(
    'SELECT id, email, name, avatar_url, created_at, updated_at, last_login FROM users WHERE id = $1 LIMIT 1',
    [id]
  );
  return res.rows[0] || null;
}

async function updatePassword(db, userId, passwordHash) {
  await db.query('UPDATE users SET password_hash = $1, updated_at = now() WHERE id = $2', [passwordHash, userId]);
}

async function updateLastLogin(db, userId) {
  await db.query('UPDATE users SET last_login = now() WHERE id = $1', [userId]);
}

async function hasPassword(db, userId) {
  const res = await db.query('SELECT password_hash FROM users WHERE id = $1', [userId]);
  return !!(res.rows[0] && res.rows[0].password_hash);
}

module.exports = { findByEmail, create, findById, updatePassword, updateLastLogin, hasPassword };
