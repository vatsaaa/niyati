"use strict";
// Re-export from @niyati/auth-core for backward compatibility
const { getProviderRedirect, handleCallback, fetchUserInfo } = require('@niyati/auth-core/lib/socialLogin');

module.exports = {
  getProviderRedirect,
  handleCallback,
  fetchUserInfo,
};
