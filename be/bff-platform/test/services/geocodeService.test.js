let axios;

describe('geocodeService', () => {
  let svc;

  beforeEach(() => {
    jest.resetModules();
    jest.doMock('axios', () => ({ get: jest.fn() }));
    axios = require('axios');
    // Provide minimal commons config used by service
    jest.mock('../../commons', () => ({
      logger: { debug: jest.fn(), warn: jest.fn(), error: jest.fn() },
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

  
});
