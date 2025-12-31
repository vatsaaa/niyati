import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../config', () => ({ buildApiUrl: (p) => `https://api${p}`, RETRY_CONFIG: { maxRetries: 1, baseDelayMs: 10 } }));
vi.mock('../../utils/uuid', () => ({ getSessionReqId: () => 'sess-1' }));

import { bffFetch, bffFetchWithRetry } from '../api';

describe('api service', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('bffFetch sets x-request-id header and calls fetch', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ status: 200, ok: true });

    const res = await bffFetch('/health');
    expect(globalThis.fetch).toHaveBeenCalled();
    const calledArgs = globalThis.fetch.mock.calls[0];
    const headers = calledArgs[1].headers;
    expect(headers.get('x-request-id')).toBe('sess-1');
    expect(res).toBeDefined();
  });

  it('bffFetchWithRetry retries on transient status', async () => {
    // mock global fetch to simulate transient then success
    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce({ status: 503, ok: false })
      .mockResolvedValueOnce({ status: 200, ok: true });

    const out = await bffFetchWithRetry('/retry');
    expect(out).toBeDefined();
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
  });
});
