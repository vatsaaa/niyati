import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../config', () => ({ CACHE_CONFIG: { geocodeTtlDays: 1 } }));
import { determineGeocodingEndpoint, resolveLocationAndTimezone } from '../geo';

vi.mock('../api', () => ({ bffFetchWithRetry: vi.fn() }));

describe('geo service', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('determineGeocodingEndpoint picks structured for street-like strings', () => {
    const out = determineGeocodingEndpoint('123 Main Street, Mumbai, MH, India');
    expect(out).toBeTruthy();
    expect(out.endpoint).toMatch(/structured/);
  });

  it('determineGeocodingEndpoint handles 3-part location as search', () => {
    const out = determineGeocodingEndpoint('City, State, Country');
    expect(out.endpoint).toBe('/geocode/search');
  });

  it('resolveLocationAndTimezone returns normalized location when API responds ok', async () => {
    const api = await import('../api');
    api.bffFetchWithRetry = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ status: 'ok', place: { lat: 10, lon: 20, city: 'Pune', display_name: 'Pune, India' } }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ status: 'ok', data: { timezone: 5 } }) });

    // ensure localStorage is clean
    localStorage.clear();
    const res = await resolveLocationAndTimezone('Pune');
    expect(res).toBeDefined();
    expect(res.location).toHaveProperty('lat');
    expect(typeof res.timezone).toBe('number');
  });
});
