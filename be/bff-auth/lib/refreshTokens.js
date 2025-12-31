const crypto = require('crypto');

// Helper: create a secure random token string (URL-safe base64)
function createRawToken(bytes = 48) {
  return crypto.randomBytes(bytes).toString('base64url');
}

// Hash a raw token for storage (sha256 hex)
function hashToken(raw) {
  return crypto.createHash('sha256').update(raw, 'utf8').digest('hex');
}

// Store a refresh token in the DB. Expects `db` to be a PG client with `query` method.
// Returns the inserted row id and expires_at.
async function storeRefreshToken(db, { userId, tokenHash, expiresAt }) {
  if (!db || typeof db.query !== 'function') {
    throw new Error('Database client not configured');
  }

  const sql = `INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3) RETURNING id, expires_at`;
  const params = [userId, tokenHash, expiresAt];
  const res = await db.query(sql, params);
  return res.rows[0];
}

// Find a refresh token row by token hash and update last_used_at
async function findRefreshTokenByHash(db, tokenHash, updateLastUsed = false) {
  if (!db || typeof db.query !== 'function') {
    throw new Error('Database client not configured');
  }
  const sql = `SELECT id, user_id, token_hash, expires_at, revoked, created_at, last_used_at FROM refresh_tokens WHERE token_hash = $1 LIMIT 1`;
  const res = await db.query(sql, [tokenHash]);
  const row = res.rows[0] || null;

  // If requested, update last_used_at in DB but preserve the original value
  if (row && updateLastUsed) {
    const originalLastUsed = row.last_used_at || null;
    await db.query('UPDATE refresh_tokens SET last_used_at = now() WHERE id = $1', [row.id]);
    // Return the original last_used_at so callers can detect suspicious quick re-use
    row.last_used_at = originalLastUsed;
  }

  return row;
}

// Mark a token revoked
async function revokeRefreshToken(db, id) {
  if (!db || typeof db.query !== 'function') {
    throw new Error('Database client not configured');
  }
  const sql = `UPDATE refresh_tokens SET revoked = true WHERE id = $1 RETURNING id`;
  const res = await db.query(sql, [id]);
  return res.rowCount > 0;
}

// Rotate a refresh token: revoke the old one and insert a new one in a transaction
async function rotateRefreshToken(db, { oldTokenId, userId, newTokenHash, expiresAt }) {
  if (!db || typeof db.query !== 'function') {
    throw new Error('Database client not configured');
  }

  // Use a transaction to ensure atomicity
  await db.query('BEGIN');
  try {
    if (oldTokenId) {
      await db.query('UPDATE refresh_tokens SET revoked = true WHERE id = $1', [oldTokenId]);
    }
    const insertRes = await db.query(
      'INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3) RETURNING id, expires_at',
      [userId, newTokenHash, expiresAt]
    );
    await db.query('COMMIT');
    return insertRes.rows[0];
  } catch (err) {
    await db.query('ROLLBACK');
    throw err;
  }
}

module.exports = {
  createRawToken,
  hashToken,
  storeRefreshToken,
  findRefreshTokenByHash,
  revokeRefreshToken,
  rotateRefreshToken
};
