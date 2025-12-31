import { describe, it, expect } from 'vitest';
import { extractProfileFields } from '../profileExtractor';

describe('profileExtractor', () => {
  it('returns empty for non-string input', async () => {
    expect(await extractProfileFields(null)).toEqual({});
  });

  it('extracts dob and name from text heuristically', async () => {
    const res = await extractProfileFields('My name is Alice and I was born on 1990-05-03 at 02:30');
    expect(res.name || '').toMatch(/Alice/i);
    expect(res.dob || '').toContain('1990');
  });
});
