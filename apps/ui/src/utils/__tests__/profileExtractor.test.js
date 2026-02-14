import { describe, it, expect, vi, beforeEach } from 'vitest';
import { extractProfileFields } from '../profileExtractor';

// Mock the bffFetchWithRetry to avoid actual network calls in unit tests
vi.mock('../../services/api', () => ({
  bffFetchWithRetry: vi.fn()
}));

import { bffFetchWithRetry } from '../../services/api';

describe('profileExtractor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns empty for non-string input', async () => {
    expect(await extractProfileFields(null)).toEqual({});
  });

  it('extracts fields via BFF when available', async () => {
    // Mock successful BFF response
    bffFetchWithRetry.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        status: 'ok',
        data: { name: 'Alice', dob: '1990-05-03', timeOfBirth: '02:30' }
      })
    });

    const res = await extractProfileFields('My name is Alice and I was born on 1990-05-03 at 02:30');
    expect(res.name).toBe('Alice');
    expect(res.dob).toBe('1990-05-03');
    expect(res.timeOfBirth).toBe('02:30');
  });

  it('returns empty result when BFF call throws (no client-side fallback)', async () => {
    // Mock BFF failure — UI delegates all extraction to BFF, so fallback is empty
    bffFetchWithRetry.mockRejectedValueOnce(new Error('Network error'));

    const res = await extractProfileFields('My name is Alice and I was born on 1990-05-03 at 02:30');
    // No client-side regex fallback per Lightweight UI principle
    expect(res).toEqual({});
  });

  it('returns empty result when BFF returns error status', async () => {
    // Mock non-ok response
    bffFetchWithRetry.mockResolvedValueOnce({
      ok: false,
      status: 500
    });

    const res = await extractProfileFields('I am John Doe');
    // No client-side extraction — empty result on BFF failure
    expect(res).toEqual({});
  });
});
