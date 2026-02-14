jest.mock('axios');
const axios = require('axios');
const geocodeService = require('../services/geocodeService');
const config = require('@niyati/commons/config');

describe('geocodeService.callMapsCo and wrappers', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  test('callMapsCo returns provider data and caches it', async () => {
    const sample = [{ lat: '12.34', lon: '56.78', display_name: 'Test City, Testland', address: { city: 'Test City', country: 'Testland' } }];
    axios.get.mockResolvedValueOnce({ status: 200, data: sample });

    const data = await geocodeService.callMapsCo('/search', { q: 'Test City' }, { timeout: 1000 });
    expect(data).toEqual(sample);

    // second call should return from cache and not call axios again
    axios.get.mockImplementation(() => { throw new Error('Should not be called'); });
    const cached = await geocodeService.callMapsCo('/search', { q: 'Test City' }, { timeout: 1000 });
    expect(cached).toEqual(sample);
  });

  test('callMapsCo falls back to nominatim when primary fails', async () => {
    const primaryErr = new Error('Bad Gateway');
    primaryErr.response = { status: 502 };
    const fallback = [{ lat: '1', lon: '2', display_name: 'Fallback City, Land', address: { city: 'Fallback City', country: 'Land' } }];

    axios.get.mockImplementation(async (url) => {
      if (url.includes(config.geocode.baseUrl)) {
        throw primaryErr;
      }
      // fallback URL contains nominatim
      return { status: 200, data: fallback };
    });

    const data = await geocodeService.callMapsCo('/search', { q: 'Nowhere' }, { timeout: 1000 });
    expect(data).toEqual(fallback);
  });

  test('geocode convenience wrapper throws on invalid input', async () => {
    await expect(geocodeService.geocode(null)).rejects.toThrow('Invalid location');
    await expect(geocodeService.geocode('   ')).rejects.toThrow('Invalid location');
  });
});
