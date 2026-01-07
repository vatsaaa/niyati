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

  it('falls back to regex when BFF fails', async () => {
    // Mock BFF failure
    bffFetchWithRetry.mockRejectedValueOnce(new Error('Network error'));

    const res = await extractProfileFields('My name is Alice and I was born on 1990-05-03 at 02:30');
    // Fallback regex should extract basic patterns
    expect(res.name || '').toMatch(/Alice/i);
    expect(res.dob || '').toContain('1990');
  });

  it('falls back when BFF returns error status', async () => {
    // Mock non-ok response
    bffFetchWithRetry.mockResolvedValueOnce({
      ok: false,
      status: 500
    });

    const res = await extractProfileFields('I am John Doe');
    // Fallback should still work
    expect(res.name || '').toMatch(/John/i);
  });
});
