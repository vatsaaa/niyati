jest.mock('axios');
const axios = require('axios');

describe('astrologyService (test-mode behavior)', () => {
  let svc;

  beforeEach(() => {
    jest.resetModules();
    process.env.NODE_ENV = 'test';
    // minimal commons
    jest.mock('@niyati/commons', () => ({ logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn(), fatal: jest.fn(), trace: jest.fn(), debug: jest.fn(), warn: jest.fn(), info: jest.fn(), error: jest.fn() }, sanitize: v => v, config: { astrology: { baseUrl: '' }, retryMax: 1, retryBaseMs: 10 } }));
    svc = require('../../services/astrologyService');
  });

  afterEach(() => {
    jest.restoreAllMocks();
    delete process.env.ASTRO_API_BASE_URL;
  });

  test('planets returns mock for valid numeric/profile input', async () => {
    const payload = { year: 1990, month: 1, date: 2, lat: 10, lon: 20 };
    const res = await svc.planets({ year: 1990, month: 1, date: 2, lat: 10, lon: 20 });
    expect(Array.isArray(res)).toBeTruthy();
    expect(res[0]).toHaveProperty('name');
  });

  test('planets throws missing_profile_fields when required fields missing', async () => {
    await expect(svc.planets({})).rejects.toThrow(/missing_profile_fields/);
  });

  test('compute returns mock when no provider configured', async () => {
    const profile = { name: 'T', dob: '1990-01-01', placeOfBirth: { lat: 10, lng: 20 } };
    const out = await svc.compute(profile);
    expect(out.status).toBe('ok');
    expect(out.source).toMatch(/mocked-astrology/);
  });

  test('compute throws when profile missing fields', async () => {
    await expect(svc.compute({})).rejects.toThrow(/missing_profile_fields/);
  });
});
