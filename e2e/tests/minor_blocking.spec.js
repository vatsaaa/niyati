const { test, expect } = require('@playwright/test');

test('minor profile is blocked and no webhook forwarded', async ({ page }) => {
  // Stub identify: first-time user returns not returning (so UI will attempt to send profile)
  await page.route('**/api/v1/users/identify', route => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ status: 'ok', data: { returning: false, user: null } })
    });
  });

  // Capture any webhook calls to ensure none are made for minors
  let webhookCalled = false;
  await page.route('**/webhook/**', route => {
    webhookCalled = true;
    route.fulfill({ status: 200, body: JSON.stringify({ output: 'SHOULD NOT BE CALLED' }) });
  });

  // Visit the app and wait for UI to settle
  await page.goto('/', { waitUntil: 'networkidle' });

  // Fill chat input with a profile containing a minor DOB (e.g., 2010)
  const profileMessage = 'My name is Minor User. Born on 01-Jan-2010 at 10:00 in Mumbai.';
  await page.waitForSelector('[data-testid=chat-input]', { timeout: 10000 });
  await page.fill('[data-testid=chat-input]', profileMessage);
  await page.click('[data-testid=send-button]');

  // UI should show a message discouraging minors from providing profile details
  const blockedMsg = page.locator('text=/under 18|cannot accept profile details/i');
  await expect(blockedMsg).toBeVisible({ timeout: 5000 });

  // Ensure no webhook was called
  expect(webhookCalled).toBe(false);
});
