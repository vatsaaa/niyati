/**
 * Refresh token store factory — pure crypto helpers + parameterized DB operations.
 *
 * Usage:
 *   const { createRefreshTokenStore, createRawToken, hashToken } = require('@niyati/auth-core/lib/refreshTokens');
 *   const store = createRefreshTokenStore({ tableName: 'refresh_tokens' });
 *   const raw = createRawToken();
 *   const hash = hashToken(raw);
 *   await store.storeRefreshToken(db, { userId, tokenHash: hash, expiresAt });
 */

const crypto = require('crypto');

// ── Pure crypto helpers (no DB coupling) ──

function createRawToken(bytes = 48) {
  return crypto.randomBytes(bytes).toString('base64url');
}

function hashToken(raw) {
  return crypto.createHash('sha256').update(raw, 'utf8').digest('hex');
}

// ── Factory: parameterized DB operations ──

function createRefreshTokenStore({ tableName = 'refresh_tokens' } = {}) {
  function requireDb(db) {
    if (!db || typeof db.query !== 'function') {
      throw new Error('Database client not configured');
    }
  }

  async function storeRefreshToken(db, { userId, tokenHash, expiresAt }) {
    requireDb(db);
    const sql = `INSERT INTO ${tableName} (user_id, token_hash, expires_at) VALUES ($1, $2, $3) RETURNING id, expires_at`;
    const res = await db.query(sql, [userId, tokenHash, expiresAt]);
    return res.rows[0];
  }

  async function findByHash(db, tokenHash, updateLastUsed = false) {
    requireDb(db);
    const sql = `SELECT id, user_id, token_hash, expires_at, revoked, created_at, last_used_at FROM ${tableName} WHERE token_hash = $1 LIMIT 1`;
    const res = await db.query(sql, [tokenHash]);
    const row = res.rows[0] || null;

    if (row && updateLastUsed) {
      const originalLastUsed = row.last_used_at || null;
      await db.query(`UPDATE ${tableName} SET last_used_at = now() WHERE id = $1`, [row.id]);
      row.last_used_at = originalLastUsed;
    }

    return row;
  }

  async function revoke(db, id) {
    requireDb(db);
    const sql = `UPDATE ${tableName} SET revoked = true WHERE id = $1 RETURNING id`;
    const res = await db.query(sql, [id]);
    return res.rowCount > 0;
  }

  async function rotate(db, { oldTokenId, userId, newTokenHash, expiresAt }) {
    requireDb(db);
    await db.query('BEGIN');
    try {
      if (oldTokenId) {
        await db.query(`UPDATE ${tableName} SET revoked = true WHERE id = $1`, [oldTokenId]);
      }
      const insertRes = await db.query(
        `INSERT INTO ${tableName} (user_id, token_hash, expires_at) VALUES ($1, $2, $3) RETURNING id, expires_at`,
        [userId, newTokenHash, expiresAt]
      );
      await db.query('COMMIT');
      return insertRes.rows[0];
    } catch (err) {
      await db.query('ROLLBACK');
      throw err;
    }
  }

  async function revokeAllForUser(db, userId) {
    requireDb(db);
    await db.query(
      `UPDATE ${tableName} SET revoked = true WHERE user_id = $1 AND revoked = false`,
      [userId]
    );
  }

  return { storeRefreshToken, findByHash, revoke, rotate, revokeAllForUser };
}

module.exports = { createRawToken, hashToken, createRefreshTokenStore };
