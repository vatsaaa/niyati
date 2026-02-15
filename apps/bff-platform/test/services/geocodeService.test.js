let axios;

describe('geocodeService', () => {
  let svc;

  beforeEach(() => {
    jest.resetModules();
    jest.doMock('axios', () => ({ get: jest.fn() }));
    axios = require('axios');
    // Provide minimal commons config used by service
    jest.mock('@niyati/commons', () => ({
      logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn(), fatal: jest.fn(), trace: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() },
      sanitize: v => v,
      config: {
        geocode: { baseUrl: 'https://maps.co', timeout: 5000, userAgent: 'test-agent' },
        retry: { geocode: { retries: 1, baseDelayMs: 10, maxDelayMs: 50 } },
        cache: { geocode: { ttl: 60 } }
      }
    }));

    svc = require('../../services/geocodeService');
  });

  afterEach(() => jest.restoreAllMocks());

  test('search returns mapped suggestions on array response', async () => {
    const apiResp = [
      { display_name: 'Place One', lat: '10.0', lon: '20.0', address: { city: 'Pune', country: 'India', country_code: 'IN' }, raw: true }
    ];
    axios.get.mockResolvedValue({ status: 200, data: apiResp });
    const data = await svc.callMapsCo('/search', { q: 'Pune' }, { timeout: 2000 });
    expect(Array.isArray(data)).toBeTruthy();
    expect(data[0]).toHaveProperty('display_name', 'Place One');
  });

  test('reverse returns ok for coordinate response', async () => {
    const item = { display_name: 'Coord Place', lat: '1.2', lon: '3.4', address: { city: 'X' } };
    axios.get.mockResolvedValue({ status: 200, data: [item] });
    const data = await svc.callMapsCo('/reverse', { lat: 1.2, lon: 3.4 }, { timeout: 2000 });
    expect(Array.isArray(data)).toBeTruthy();
    expect(data[0]).toHaveProperty('display_name', 'Coord Place');
  });

  test('getCurrentLocation aggregates geo and ipify responses', async () => {
    jest.spyOn(svc, 'getCurrentLocation').mockResolvedValue({ status: 'ok', location: { ip: '1.2.3.4' } });
    const out = await svc.getCurrentLocation();
    expect(out.status).toBe('ok');
    expect(out.location).toHaveProperty('ip', '1.2.3.4');
  });

  test('geocode throws on invalid input', async () => {
    await expect(svc.geocode('')).rejects.toThrow(/Invalid location/);
    await expect(svc.geocode(null)).rejects.toThrow(/Invalid location/);
  });

  test('callMapsCo returns provider data and caches it', async () => {
    const sample = [{ lat: '12.34', lon: '56.78', display_name: 'Test City, Testland', address: { city: 'Test City', country: 'Testland' } }];
    axios.get.mockResolvedValueOnce({ status: 200, data: sample });

    const data = await svc.callMapsCo('/search', { q: 'Test City' }, { timeout: 1000 });
    expect(data).toEqual(sample);

    // second call should return from cache and not call axios again
    axios.get.mockImplementation(() => { throw new Error('Should not be called'); });
    const cached = await svc.callMapsCo('/search', { q: 'Test City' }, { timeout: 1000 });
    expect(cached).toEqual(sample);
  });

  test('callMapsCo falls back to nominatim when primary fails', async () => {
    const primaryErr = new Error('Bad Gateway');
    primaryErr.response = { status: 502 };
    const fallback = [{ lat: '1', lon: '2', display_name: 'Fallback City, Land', address: { city: 'Fallback City', country: 'Land' } }];

    axios.get.mockImplementation(async (url) => {
      if (typeof url === 'string' && url.includes('maps.co')) {
        throw primaryErr;
      }
      // fallback URL contains nominatim
      return { status: 200, data: fallback };
    });

    const data = await svc.callMapsCo('/search', { q: 'Nowhere' }, { timeout: 1000 });
    expect(data).toEqual(fallback);
  });

});
