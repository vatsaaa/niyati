// @niyati/auth-core — reusable authentication utilities
//
// This package provides generic, framework-agnostic auth building blocks:
//   - Validation helpers (email, password, timing-safe compare)
//   - OAuth2 + PKCE helpers and social login flow
//   - Rate limiter factory for Express
//   - Email provider (nodemailer wrapper with injectable logger)
//   - JWT auth middleware factory (injectable verifyToken + error codes)
//   - JWT provider factory (configurable issuer, audience, secret)
//   - Remote auth middleware factory (configurable validate URL, caching)
//   - Refresh token store factory (parameterized table name)
//   - Password reset store factory (parameterized table name)

const utils = require('./lib/utils');
const oauth = require('./lib/oauth');
const { createRateLimiter } = require('./lib/rateLimiter');
const { sendMail, createEmailProvider } = require('./lib/emailProvider');
const socialLogin = require('./lib/socialLogin');
const { createAuthMiddleware } = require('./lib/authMiddleware');
const { createJwtProvider } = require('./lib/jwt');
const { createRemoteAuthMiddleware } = require('./lib/remoteAuthMiddleware');
const refreshTokens = require('./lib/refreshTokens');
const passwordReset = require('./lib/passwordReset');
const { createPasswordHasher } = require('./lib/passwordHasher');
const { createAuthFlows } = require('./lib/authFlows');

module.exports = {
  // Validation helpers
  isValidEmail: utils.isValidEmail,
  isValidPassword: utils.isValidPassword,
  timingSafeEqual: utils.timingSafeEqual,
  utils,

  // OAuth2 + PKCE
  generateCodeVerifier: oauth.generateCodeVerifier,
  generateCodeChallenge: oauth.generateCodeChallenge,
  generateState: oauth.generateState,
  getProviderConfig: oauth.getProviderConfig,
  oauth,

  // Social login (redirect, callback, userinfo)
  getProviderRedirect: socialLogin.getProviderRedirect,
  handleCallback: socialLogin.handleCallback,
  fetchUserInfo: socialLogin.fetchUserInfo,
  socialLogin,

  // Rate limiting
  createRateLimiter,

  // Email
  sendMail,
  createEmailProvider,

  // Auth middleware (local JWT verify — injectable verifyToken)
  createAuthMiddleware,

  // JWT provider (configurable issuer/audience/secret)
  createJwtProvider,

  // Remote auth middleware (configurable validate URL + caching)
  createRemoteAuthMiddleware,

  // Refresh token store (parameterized table name)
  createRefreshTokenStore: refreshTokens.createRefreshTokenStore,
  refreshTokenCreateRawToken: refreshTokens.createRawToken,
  refreshTokenHashToken: refreshTokens.hashToken,
  refreshTokens,

  // Password reset store (parameterized table name)
  createPasswordResetStore: passwordReset.createPasswordResetStore,
  passwordResetCreateRawToken: passwordReset.createRawToken,
  passwordResetHashToken: passwordReset.hashToken,
  passwordReset,

  // Password hasher (bcrypt wrapper)
  createPasswordHasher,

  // Auth flows factory (full auth business logic)
  createAuthFlows
};
