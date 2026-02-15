// Re-export from @niyati/auth-core for backward compatibility.
// The store is created with niyati's default table name 'password_resets'.
const {
  createRawToken,
  hashToken,
  createPasswordResetStore
} = require('@niyati/auth-core/lib/passwordReset');

const store = createPasswordResetStore({ tableName: 'password_resets' });

module.exports = {
  createRawToken,
  hashToken,
  storePasswordReset: store.storeReset,
  findByHash: store.findByHash,
  markUsed: store.markUsed,
  findRecent: store.findRecent
};
