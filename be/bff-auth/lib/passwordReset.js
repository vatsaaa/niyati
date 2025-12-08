const crypto = require('crypto');

function createRawToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString('base64url');
}

function hashToken(raw) {
  return crypto.createHash('sha256').update(raw, 'utf8').digest('hex');
}

async function storePasswordReset(db, { userId, tokenHash, expiresAt }) {
  const sql = `INSERT INTO password_resets (user_id, token_hash, expires_at) VALUES ($1, $2, $3) RETURNING id, expires_at`;
  const res = await db.query(sql, [userId, tokenHash, expiresAt]);
  return res.rows[0];
}

async function findByHash(db, tokenHash) {
  const sql = `SELECT id, user_id, token_hash, expires_at, used FROM password_resets WHERE token_hash = $1 LIMIT 1`;
  const res = await db.query(sql, [tokenHash]);
  return res.rows[0] || null;
}

async function markUsed(db, id) {
  const sql = `UPDATE password_resets SET used = true WHERE id = $1 RETURNING id`;
  const res = await db.query(sql, [id]);
  return res.rowCount > 0;
}

module.exports = {
  createRawToken,
  hashToken,
  storePasswordReset,
  findByHash,
  markUsed
};
