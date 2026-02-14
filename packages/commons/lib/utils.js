// Re-export from @niyati/auth-core for backward compatibility
const { isValidEmail, isValidPassword, timingSafeEqual } = require('@niyati/auth-core/lib/utils');

module.exports = {
  isValidEmail,
  isValidPassword,
  timingSafeEqual
};
