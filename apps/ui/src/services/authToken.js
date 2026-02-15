/**
 * Auth token storage for bffFetch.
 *
 * Stores the access_token received from POST /users/identify
 * so that bffFetch can include it as Authorization: Bearer header
 * on subsequent API calls to authenticated bff-platform routes.
 *
 * Token is stored in memory (lost on page refresh) and mirrored
 * to sessionStorage for resilience during SPA navigation.
 */

const STORAGE_KEY = 'niyati_access_token';

let token = null;

/**
 * Store the access token received from identify.
 * @param {string} accessToken - JWT access token
 */
export function setAccessToken(accessToken) {
  token = accessToken || null;
  try {
    if (token) {
      sessionStorage.setItem(STORAGE_KEY, token);
    } else {
      sessionStorage.removeItem(STORAGE_KEY);
    }
  } catch {
    // sessionStorage unavailable (SSR, private browsing edge cases)
  }
}

/**
 * Retrieve the stored access token.
 * Falls back to sessionStorage if in-memory token was lost (e.g. module reload).
 * @returns {string|null}
 */
export function getAccessToken() {
  if (token) return token;
  try {
    token = sessionStorage.getItem(STORAGE_KEY) || null;
  } catch {
    // sessionStorage unavailable
  }
  return token;
}

/**
 * Clear the stored access token (logout).
 */
export function clearAccessToken() {
  token = null;
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // sessionStorage unavailable
  }
}
