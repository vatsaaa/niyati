const { validateChecks, validateEnv } = require('../lib/validateEnv');

describe('validateEnv (bff-platform)', () => {
  const savedEnv = { ...process.env };
  afterEach(() => {
    process.env = { ...savedEnv };
  });

  test('validateChecks reports missing required vars', () => {
    delete process.env.ASTRO_API_URL;
    delete process.env.ASTRO_API_KEY;
    delete process.env.PORT;

    const { errors, warnings } = validateChecks();
    expect(Array.isArray(errors)).toBe(true);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some(e => e.includes('ASTRO_API_URL') || e.includes('ASTRO_API_KEY') || e.includes('PORT'))).toBe(true);
  });

  test('validateEnv throws when required vars missing', () => {
    delete process.env.ASTRO_API_URL;
    delete process.env.ASTRO_API_KEY;
    delete process.env.PORT;

    expect(() => validateEnv()).toThrow('process.exit:1');
  });
});
