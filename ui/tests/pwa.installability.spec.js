const { test, expect } = require('@playwright/test');

const BASE = process.env.PWA_URL || 'http://localhost:4173';

test.describe('PWA installability basics', () => {
  test('has manifest and required fields', async ({ page }) => {
    await page.goto(BASE, { waitUntil: 'networkidle' });

    // manifest link
    const manifestHref = await page.evaluate(() => {
      const el = document.querySelector('link[rel="manifest"]');
      return el ? el.href : null;
    });
    expect(manifestHref).toBeTruthy();

    // fetch manifest and check fields
    const manifest = await page.request.get(manifestHref).then((r) => r.json());
    expect(manifest.name || manifest.short_name).toBeTruthy();
    expect(manifest.start_url).toBeTruthy();
    expect(manifest.display).toBeTruthy();
    expect(Array.isArray(manifest.icons)).toBeTruthy();
  });

  test('service worker is registered', async ({ page }) => {
    await page.goto(BASE, { waitUntil: 'networkidle' });

    const registered = await page.evaluate(async () => {
      if (!('serviceWorker' in navigator)) return false;
      try {
        const reg = await navigator.serviceWorker.getRegistration();
        return !!reg;
      } catch (e) {
        return false;
      }
    });
    expect(registered).toBe(true);
  });
});
