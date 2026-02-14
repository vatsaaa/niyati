import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../config', () => ({ buildApiUrl: (p) => `https://api${p}`, RETRY_CONFIG: { maxRetries: 1, baseDelayMs: 10 } }));
vi.mock('../../utils/uuid', () => ({ getSessionReqId: () => 'sess-1' }));

import { setAccessToken, getAccessToken, clearAccessToken } from '../authToken';
import { bffFetch } from '../api';

describe('authToken + bffFetch integration', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    clearAccessToken();
    globalThis.fetch = vi.fn().mockResolvedValue({ status: 200, ok: true });
  });

  it('bffFetch sends Authorization header when token is set', async () => {
    setAccessToken('test-jwt-token');
    await bffFetch('/users/profile', { method: 'POST' });

    const calledArgs = globalThis.fetch.mock.calls[0];
    const headers = calledArgs[1].headers;
    expect(headers.get('Authorization')).toBe('Bearer test-jwt-token');
  });

  it('bffFetch does NOT send Authorization header when no token', async () => {
    await bffFetch('/users/config');

    const calledArgs = globalThis.fetch.mock.calls[0];
    const headers = calledArgs[1].headers;
    expect(headers.get('Authorization')).toBeNull();
  });

  it('setAccessToken stores and getAccessToken retrieves', () => {
    expect(getAccessToken()).toBeNull();
    setAccessToken('my-token');
    expect(getAccessToken()).toBe('my-token');
  });

  it('clearAccessToken removes the token', () => {
    setAccessToken('my-token');
    clearAccessToken();
    expect(getAccessToken()).toBeNull();
  });

  it('getAccessToken falls back to sessionStorage', () => {
    sessionStorage.setItem('niyati_access_token', 'stored-token');
    clearAccessToken(); // clears in-memory
    // Force module to re-read from sessionStorage
    const retrieved = getAccessToken();
    // Note: clearAccessToken also clears sessionStorage, so we need to set after clear
    sessionStorage.setItem('niyati_access_token', 'stored-token');
    // Re-import won't help since module is cached, but we can test the fallback
    // by setting sessionStorage and calling getAccessToken when in-memory is null
    expect(retrieved).toBeNull(); // was cleared
    sessionStorage.setItem('niyati_access_token', 'fallback-token');
    // Create a fresh token ref by importing again - but for this test, just verify the flow
    expect(getAccessToken()).toBe('fallback-token');
  });
});
