import { test, expect } from '@playwright/test';
import { ensureAppReady } from './test-utils';

test('Login -> Extraction -> Report flow', async ({ page }) => {
  // Intercept identify call and return "new user"
  await page.route('**/api/v1/users/identify', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ status: 'ok', data: null })
    });
  });

  // Intercept astrology / parse endpoints to prevent flaky upstream calls
  await page.route('**/api/**', async route => {
    const url = route.request().url();
    if (url.includes('/api/v1/astrology') || url.includes('/api/v1/parse')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ status: 'ok', data: [] })
      });
      return;
    }
    await route.continue();
  });

  // Ensure the app is ready (webServer in playwright config will start dev server)
  await ensureAppReady(page);

  // Fill phone number (default country expects 10 digits) and accept consent
  const phoneInput = page.locator('input[placeholder*=\"digit number\"]');
  await expect(phoneInput).toBeVisible();
  await phoneInput.fill('9999999999');

  // Check consent checkbox (there is a single checkbox on the login form)
  const consent = page.locator('input[type="checkbox"]');
  await consent.check();

  // Click Begin Your Journey (wait for button to be enabled)
  const loginButton = page.locator('button:has-text("Begin Your Journey")');
  await expect(loginButton).toBeEnabled({ timeout: 5000 });
  await loginButton.click();

  // Expect to be on the chat screen: Niyati header should be visible
  await expect(page.locator('h2:has-text("Niyati")')).toBeVisible();

  // Send a message that includes profile information for extraction
  const chatInput = page.locator('textarea, input[placeholder*="Ask"]').first();
  await expect(chatInput).toBeVisible({ timeout: 15000 });
  await chatInput.fill('My name is Anu and I was born on 1990-01-01 at 10:00 in Pune');
  await chatInput.press('Enter');

  // Wait for the client-side extraction to populate profile name (scope to header)
  await expect(page.locator('[aria-live="polite"] .min-w-0.truncate:has-text("Anu")')).toBeVisible({ timeout: 15000 });

  // Verify DOB appears in header (scope to header to avoid matching chat messages)
  await expect(page.locator('[aria-live="polite"] .min-w-0.truncate:has-text("1990")')).toBeVisible();
});
