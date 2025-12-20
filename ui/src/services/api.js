import { buildApiUrl, RETRY_CONFIG } from '../config';
import { getSessionReqId } from '../utils/uuid';

/**
 * A wrapper for the Fetch API that automatically adds the versioned API prefix and a session-level request ID.
 * @param {string} pathOrUrl - The API path (e.g., '/users/profile') or a full URL.
 * @param {object} options - Standard Fetch API options.
 * @returns {Promise<Response>} The Fetch Response object.
 */
export async function bffFetch(pathOrUrl, options = {}) {
  // Input validation
  if (!pathOrUrl || typeof pathOrUrl !== 'string') {
    throw new Error('pathOrUrl must be a non-empty string');
  }
  if (pathOrUrl.length > 2000) {
    throw new Error('URL exceeds maximum length');
  }
  
  let url;
  if (typeof pathOrUrl === 'string' && (pathOrUrl.startsWith('http://') || pathOrUrl.startsWith('https://'))) {
    url = pathOrUrl; // Absolute URL, use as-is
  } else {
    url = buildApiUrl(pathOrUrl); // Build versioned API URL
  }

  const reqId = getSessionReqId();
  const headers = new Headers(options.headers || {});
  headers.set('x-request-id', reqId);
  
  // Add default timeout if not specified
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), options.timeout || 30000);
  
  const merged = { 
    ...options, 
    headers,
    signal: options.signal || controller.signal
  };
  
  try {
    console.log('[bffFetch] Calling:', url, 'with options:', merged);
    const response = await fetch(url, merged);
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      throw new Error('Request timeout');
    }
    throw error;
  }
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
  const retries = typeof opts.retries === 'number' && opts.retries >= 0 ? opts.retries : RETRY_CONFIG.maxRetries;
  const baseDelay = typeof opts.baseDelayMs === 'number' && opts.baseDelayMs > 0 ? opts.baseDelayMs : RETRY_CONFIG.baseDelayMs;
  const retryOnStatus = Array.isArray(opts.retryOnStatus) ? opts.retryOnStatus : [502, 503, 504, 429];

  let attempt = 0;
  let lastError = null;
  
  while (true) {
    try {
      const res = await bffFetch(pathOrUrl, options);
      if (retryOnStatus.includes(res.status) && attempt < retries) {
        lastError = new Error(`Transient status ${res.status}`);
        throw lastError;
      }
      return res;
    } catch (err) {
      lastError = err;
      attempt++;
      if (attempt > retries) {
        console.error(`Request failed after ${retries} retries:`, err?.message || err);
        throw err;
      }
      const delay = Math.min(baseDelay * Math.pow(2, attempt - 1) + Math.floor(Math.random() * 100), 10000); // Cap at 10s
      console.log(`Retry attempt ${attempt}/${retries} after ${delay}ms`);
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
    // Input validation
    if (!tag || typeof tag !== 'string') {
      console.warn('sendClientLog: tag must be a non-empty string');
      return;
    }
    if (tag.length > 100) {
      console.warn('sendClientLog: tag too long, truncating');
      tag = tag.substring(0, 100);
    }
    if (!profile || !profile.user_consentGiven) return;

    const safe = { ...meta };
    // Remove obvious PII keys if accidentally passed
    delete safe.user_name;
    delete safe.user_dob;
    delete safe.user_placeOfBirth;
    delete safe.user_timeOfBirth;
    delete safe.phoneNumber;
    delete safe.email;
    delete safe.password;

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
