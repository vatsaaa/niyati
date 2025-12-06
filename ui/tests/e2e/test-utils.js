export async function ensureAppReady(page) {
  // Navigate to the base path and wait for the app to become interactive.
  await page.goto('/');
  // Wait until network is mostly idle (helps when app makes BFF calls during boot)
  await page.waitForLoadState('networkidle');
  // Wait for either the login header or the main app header to appear
  await page.waitForSelector('form, h1:has-text("Niyati"), div:has(h2:has-text("Niyati"))', { timeout: 15000 });
}
