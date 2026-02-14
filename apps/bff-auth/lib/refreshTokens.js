// Re-export from @niyati/auth-core for backward compatibility.
// The store is created with niyati's default table name 'refresh_tokens'.
const {
  createRawToken,
  hashToken,
  createRefreshTokenStore
} = require('@niyati/auth-core/lib/refreshTokens');

const store = createRefreshTokenStore({ tableName: 'refresh_tokens' });

module.exports = {
  createRawToken,
  hashToken,
  storeRefreshToken: store.storeRefreshToken,
  findRefreshTokenByHash: store.findByHash,
  revokeRefreshToken: store.revoke,
  rotateRefreshToken: store.rotate,
  revokeAllForUser: store.revokeAllForUser
};
