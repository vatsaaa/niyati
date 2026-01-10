import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../config', () => ({ CACHE_CONFIG: { astrologyTtlDays: 1 }, buildApiUrl: (p) => `https://api${p}` }));
vi.mock('../api', () => ({ bffFetchWithRetry: vi.fn(), sendClientLog: vi.fn() }));
vi.mock('../geo', () => ({ resolveLocationAndTimezone: vi.fn() }));

import * as apiMod from '../api';
import * as geoMod from '../geo';
import { calculateAstrology, processCompleteProfile } from '../astrology';

describe('astrology service', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('calculateAstrology calls planets and horoscope endpoints and returns results', async () => {
    const api = await import('../api');
    api.bffFetchWithRetry = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ planets: ['p'] }) })
      .mockResolvedValueOnce({ ok: true, text: async () => '<svg/>' });

    const profile = { name: 'T', birthDate: '1990-01-01', timeOfBirth: '00:00:00', placeOfBirth: 'X' };
    const location = { lat: 10, lon: 20 };
    const out = await calculateAstrology(profile, location, 5);
    expect(out).toHaveProperty('planets');
    expect(out).toHaveProperty('horoscopeSvg');
  });

  it('processCompleteProfile integrates location resolution and persists profile', async () => {
    const geo = await import('../geo');
    geo.resolveLocationAndTimezone = vi.fn().mockResolvedValue({ location: { lat: 10, lon: 20 }, timezone: 5 });
    const api = await import('../api');
    api.bffFetchWithRetry = vi.fn()
      // first call persists profile
      .mockResolvedValueOnce({ ok: true, json: async () => ({ status: 'ok' }) })
      // second call: planets
      .mockResolvedValueOnce({ ok: true, json: async () => ({ planets: [] }) })
      // third call: horoscope svg
      .mockResolvedValueOnce({ ok: true, text: async () => '<svg/>' });

    const profile = { name: 'T', birthDate: '1990-01-01', timeOfBirth: '00:00:00', placeOfBirth: 'X', consentGiven: true };
    const res = await processCompleteProfile(profile, [], '+91-99999');
    expect(res).toHaveProperty('planets');
  });
});
