import { buildApiUrl, RETRY_CONFIG } from '../config';
import { getSessionReqId } from '../utils/uuid';

/**
 * A wrapper for the Fetch API that automatically adds the versioned API prefix and a session-level request ID.
 * @param {string} pathOrUrl - The API path (e.g., '/users/profile') or a full URL.
 * @param {object} options - Standard Fetch API options.
 * @returns {Promise<Response>} The Fetch Response object.
 */
export async function bffFetch(pathOrUrl, options = {}) {
  let url;
  if (typeof pathOrUrl === 'string' && (pathOrUrl.startsWith('http://') || pathOrUrl.startsWith('https://'))) {
    url = pathOrUrl; // Absolute URL, use as-is
  } else {
    url = buildApiUrl(pathOrUrl); // Build versioned API URL
  }

  const reqId = getSessionReqId();
  const headers = new Headers(options.headers || {});
  headers.set('x-request-id', reqId);

  const merged = { ...options, headers };
  console.log('[bffFetch] Calling:', url, 'with options:', merged);
  return fetch(url, merged);
}

/**
 * A wrapper around bffFetch that retries transient errors with exponential backoff.
 * @param {string} pathOrUrl - The API path or full URL.
 * @param {object} options - Standard Fetch API options.
 * @param {object} opts - Retry options.
 * @param {number} [opts.retries=RETRY_CONFIG.maxRetries] - The maximum number of retries.
 * @param {number} [opts.baseDelayMs=RETRY_CONFIG.baseDelayMs] - The base delay for exponential backoff.
 * @param {number[]} [opts.retryOnStatus=[502, 503, 504, 429]] - The status codes that should trigger a retry.
 * @returns {Promise<Response>} The Fetch Response object.
 */
export async function bffFetchWithRetry(pathOrUrl, options = {}, opts = {}) {
  const retries = typeof opts.retries === 'number' ? opts.retries : RETRY_CONFIG.maxRetries;
  const baseDelay = typeof opts.baseDelayMs === 'number' ? opts.baseDelayMs : RETRY_CONFIG.baseDelayMs;
  const retryOnStatus = Array.isArray(opts.retryOnStatus) ? opts.retryOnStatus : [502, 503, 504, 429];

  let attempt = 0;
  while (true) {
    try {
      const res = await bffFetch(pathOrUrl, options);
      if (retryOnStatus.includes(res.status) && attempt < retries) {
        throw new Error(`Transient status ${res.status}`);
      }
      return res;
    } catch (err) {
      attempt++;
      if (attempt > retries) throw err;
      const delay = baseDelay * Math.pow(2, attempt - 1) + Math.floor(Math.random() * 100);
      await new Promise(r => setTimeout(r, delay));
    }
  }
}

/**
 * Sends a sanitized telemetry event to the BFF for central logging.
 * This is a fire-and-forget operation.
 * @param {string} tag - A tag to identify the log event.
 * @param {object} meta - Additional metadata to include in the log.
 * @param {object} profile - The user's profile object to check for consent.
 */
export async function sendClientLog(tag, meta = {}, profile) {
  try {
    if (!profile || !profile.user_consentGiven) return;

    const safe = { ...meta };
    // Remove obvious PII keys if accidentally passed
    delete safe.user_name;
    delete safe.user_dob;
    delete safe.user_placeOfBirth;
    delete safe.user_timeOfBirth;
    delete safe.phoneNumber;

    await bffFetch('/telemetry/log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: tag,
        level: 'info',
        tag,
        meta: safe,
        ts: Date.now()
      })
    });
  } catch (e) {
    // best-effort, do not surface to user
  }
}
