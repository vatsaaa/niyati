/**
 * SQL-based OAuth accounts repository for niyati.
 * Implements the oauthRepo interface expected by @niyati/auth-core's createAuthFlows.
 */

async function find(db, provider, providerId) {
  const res = await db.query(
    'SELECT id, user_id FROM oauth_accounts WHERE provider = $1 AND provider_id = $2 LIMIT 1',
    [provider, providerId]
  );
  return res.rows[0] || null;
}

async function create(db, { userId, provider, providerId, tokenMeta }) {
  const res = await db.query(
    'INSERT INTO oauth_accounts (user_id, provider, provider_id, token_meta, created_at) VALUES ($1, $2, $3, $4, now()) RETURNING id',
    [userId, provider, providerId, tokenMeta || null]
  );
  return res.rows[0];
}

async function deleteAccount(db, userId, provider) {
  await db.query('DELETE FROM oauth_accounts WHERE user_id = $1 AND provider = $2', [userId, provider]);
}

async function countOtherProviders(db, userId, excludeProvider) {
  const res = await db.query(
    'SELECT count(*)::int AS cnt FROM oauth_accounts WHERE user_id = $1 AND provider != $2',
    [userId, excludeProvider]
  );
  return res.rows[0]?.cnt || 0;
}

module.exports = { find, create, delete: deleteAccount, countOtherProviders };
