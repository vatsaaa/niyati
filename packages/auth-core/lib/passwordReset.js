/**
 * Password reset store factory — pure crypto helpers + parameterized DB operations.
 *
 * Usage:
 *   const { createPasswordResetStore, createRawToken, hashToken } = require('@niyati/auth-core/lib/passwordReset');
 *   const store = createPasswordResetStore({ tableName: 'password_resets' });
 *   const raw = createRawToken();
 *   const hash = hashToken(raw);
 *   await store.storeReset(db, { userId, tokenHash: hash, expiresAt });
 */

const crypto = require('crypto');

// ── Pure crypto helpers (no DB coupling) ──

function createRawToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString('base64url');
}

function hashToken(raw) {
  return crypto.createHash('sha256').update(raw, 'utf8').digest('hex');
}

// ── Factory: parameterized DB operations ──

function createPasswordResetStore({ tableName = 'password_resets' } = {}) {
  async function storeReset(db, { userId, tokenHash, expiresAt }) {
    const sql = `INSERT INTO ${tableName} (user_id, token_hash, expires_at) VALUES ($1, $2, $3) RETURNING id, expires_at`;
    const res = await db.query(sql, [userId, tokenHash, expiresAt]);
    return res.rows[0];
  }

  async function findByHash(db, tokenHash) {
    const sql = `SELECT id, user_id, token_hash, expires_at, used FROM ${tableName} WHERE token_hash = $1 LIMIT 1`;
    const res = await db.query(sql, [tokenHash]);
    return res.rows[0] || null;
  }

  async function markUsed(db, id) {
    const sql = `UPDATE ${tableName} SET used = true WHERE id = $1 RETURNING id`;
    const res = await db.query(sql, [id]);
    return res.rowCount > 0;
  }

  async function findRecent(db, userId, windowMinutes = 5) {
    const cutoff = new Date(Date.now() - windowMinutes * 60 * 1000);
    const sql = `SELECT id FROM ${tableName} WHERE user_id = $1 AND created_at > $2 LIMIT 1`;
    const res = await db.query(sql, [userId, cutoff]);
    return res.rows[0] || null;
  }

  return { storeReset, findByHash, markUsed, findRecent };
}

module.exports = { createRawToken, hashToken, createPasswordResetStore };
