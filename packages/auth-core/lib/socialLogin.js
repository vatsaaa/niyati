'use strict';
const axios = require('axios');
const { URL } = require('url');
const querystring = require('querystring');
const { generateCodeVerifier, generateCodeChallenge, generateState, getProviderConfig } = require('./oauth');
const SUPPORTED_PROVIDERS = new Set(['google', 'facebook', 'apple', 'github']);

// Build an OAuth2 authorization URL (with PKCE). If `opts.raw` is true,
// return an object with `{ url, state, codeVerifier }`. Otherwise return the URL string.
function getProviderRedirect(provider, opts = {}) {
  if (!provider || typeof provider !== 'string') {
    throw new Error('provider must be a non-empty string');
  }
  if (!SUPPORTED_PROVIDERS.has(provider)) {
    throw new Error(`unsupported provider: ${provider}`);
  }
  if (opts.redirectUri && typeof opts.redirectUri !== 'string') {
    throw new Error('redirectUri must be a string');
  }
  if (opts.prompt && typeof opts.prompt !== 'string') {
    throw new Error('prompt must be a string');
  }

  const cfg = getProviderConfig(provider);
  const state = generateState();
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = generateCodeChallenge(codeVerifier);

  const authorizeBase = cfg.authorizeUrl || `https://accounts.${provider}.com/oauth2/authorize`;
  const redirectUri = opts.redirectUri || process.env.OAUTH_DEFAULT_REDIRECT_URI || 'http://localhost:3000/auth/callback';
  const clientId = cfg.clientId || 'stub-client';
  const scope = (cfg.scopes || ['openid', 'profile', 'email']).join(' ');

  const url = new URL(authorizeBase);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('scope', scope);
  url.searchParams.set('state', state);
  url.searchParams.set('code_challenge', codeChallenge);
  url.searchParams.set('code_challenge_method', 'S256');

  if (opts.prompt) url.searchParams.set('prompt', opts.prompt);

  const out = { url: url.toString(), state, codeVerifier };
  return opts.raw ? out : out.url;
}

// Exchange an authorization code for tokens. If the provider has a real `tokenUrl`
// configured we perform the HTTP exchange. Otherwise return a deterministic stub token.
async function handleCallback({ code, provider, codeVerifier, redirectUri } = {}) {
  if (!code || typeof code !== 'string') {
    throw new Error('missing or invalid code');
  }
  if (code.length > 2000) {
    throw new Error('code exceeds maximum length');
  }
  if (provider && typeof provider !== 'string') {
    throw new Error('provider must be a string');
  }
  if (codeVerifier && typeof codeVerifier !== 'string') {
    throw new Error('codeVerifier must be a string');
  }

  const cfg = getProviderConfig(provider || 'google');

  if (!cfg.tokenUrl) {
    const prov = provider || 'stub';
    return { access_token: `stub-token-${prov}-${code}`, id_token: null };
  }

  const body = {
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri || process.env.OAUTH_DEFAULT_REDIRECT_URI || 'http://localhost:3000/auth/callback',
    client_id: cfg.clientId,
    code_verifier: codeVerifier,
  };

  if (cfg.clientSecret) body.client_secret = cfg.clientSecret;

  const headers = { 'Content-Type': 'application/x-www-form-urlencoded' };

  try {
    const res = await axios.post(cfg.tokenUrl, querystring.stringify(body), {
      headers,
      timeout: 15000,
      maxRedirects: 5
    });
    const data = res && res.data ? res.data : {};
    return data;
  } catch (error) {
    const errorMsg = error.response?.data?.error_description || error.response?.data?.error || error.message || 'Token exchange failed';
    throw new Error(`OAuth token exchange failed: ${errorMsg}`);
  }
}

// Fetch user info from provider's userinfo endpoint when available.
async function fetchUserInfo(provider, tokens = {}) {
  if (!provider || typeof provider !== 'string') {
    throw new Error('provider must be a non-empty string');
  }
  if (!tokens || typeof tokens !== 'object') {
    throw new Error('tokens must be an object');
  }

  const cfg = getProviderConfig(provider);
  if (cfg.userInfoUrl && tokens.access_token) {
    try {
      const res = await axios.get(cfg.userInfoUrl, {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
        timeout: 10000,
        maxRedirects: 5
      });
      return res.data || null;
    } catch (error) {
      console.warn('Failed to fetch user info from provider:', error.message);
    }
  }

  if (tokens.id_token) {
    try {
      const parts = tokens.id_token.split('.');
      if (parts.length >= 2) {
        const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf8'));
        return payload;
      }
    } catch (_err) {
      // ignore
    }
  }

  return null;
}

module.exports = {
  getProviderRedirect,
  handleCallback,
  fetchUserInfo,
};
