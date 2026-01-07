const { validateChecks, validateEnv } = require('@niyati/commons/lib/validateEnv');

describe('validateEnv (bff-platform)', () => {
  const savedEnv = { ...process.env };
  afterEach(() => {
    process.env = { ...savedEnv };
  });

  test('validateChecks reports missing required vars', () => {
    delete process.env.ASTRO_API_URL;
    delete process.env.ASTRO_API_KEY;
    delete process.env.PORT;

    const { errors, warnings } = validateChecks({ service: 'bff-platform' });
    expect(Array.isArray(errors)).toBe(true);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some(e => e.includes('ASTRO_API_URL') || e.includes('ASTRO_API_KEY') || e.includes('PORT'))).toBe(true);
  });

  test('validateEnv throws when required vars missing', () => {
    delete process.env.ASTRO_API_URL;
    delete process.env.ASTRO_API_KEY;
    delete process.env.PORT;

    expect(() => validateEnv({ service: 'bff-platform' })).toThrow('process.exit:1');
  });
});
