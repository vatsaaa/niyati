import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../config', () => ({ CACHE_CONFIG: { geocodeTtlDays: 1 } }));
import { determineGeocodingEndpoint, resolveLocationAndTimezone, AmbiguousLocationError } from '../geo';

vi.mock('../api', () => ({ bffFetchWithRetry: vi.fn() }));

describe('geo service', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
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

    const res = await resolveLocationAndTimezone('Pune');
    expect(res).toBeDefined();
    expect(res.location).toHaveProperty('lat');
    expect(typeof res.timezone).toBe('number');
  });

  it('throws AmbiguousLocationError when geocode returns multiple suggestions', async () => {
    const api = await import('../api');
    const suggestions = [
      { lat: 28.6, lon: 77.2, city: 'New Delhi', display_name: 'New Delhi, Delhi, India' },
      { lat: 42.4, lon: -75.1, city: 'Delhi', display_name: 'Delhi, New York, USA' }
    ];
    api.bffFetchWithRetry = vi.fn()
      .mockResolvedValue({
        ok: true,
        json: async () => ({ status: 'ambiguous', suggestions })
      });

    localStorage.clear();

    let caughtErr = null;
    try {
      await resolveLocationAndTimezone('Delhi');
    } catch (err) {
      caughtErr = err;
    }
    expect(caughtErr).toBeInstanceOf(AmbiguousLocationError);
    expect(caughtErr.suggestions).toHaveLength(2);
    expect(caughtErr.suggestions[0].display_name).toMatch(/New Delhi/);
  });

  it('AmbiguousLocationError has the right name and suggestions', () => {
    const err = new AmbiguousLocationError('test', [{ city: 'A' }, { city: 'B' }]);
    expect(err.name).toBe('AmbiguousLocationError');
    expect(err.suggestions).toHaveLength(2);
    expect(err.message).toMatch(/test/);
  });
});
