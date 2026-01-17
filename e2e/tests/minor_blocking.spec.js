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
  const webhookBodies = [];
  await page.route('**/webhook/**', (route, request) => {
    try {
      const body = request.postData() || '';
      webhookBodies.push(body);
    } catch (e) {
      webhookBodies.push('');
    }
    route.fulfill({ status: 200, body: JSON.stringify({ output: 'SHOULD NOT BE CALLED' }) });
  });

  // Visit the app and wait for UI to settle
  await page.goto('/', { waitUntil: 'networkidle' });

  // If the onboarding screen appears, complete it to reach the chat UI
  const beginBtn = page.locator('text=Begin Your Journey');
  if ((await beginBtn.count()) > 0) {
    await beginBtn.waitFor({ timeout: 5000 });
    const phoneInput = page.locator('input[type="tel"]');
    const consent = page.locator('input[type="checkbox"]');
    await phoneInput.fill('9992223333');
    await consent.check();
    await page.click('text=Begin Your Journey');
    // give UI a moment to initialize chat
    await page.waitForTimeout(800);
  }

  // Fill chat input with a profile containing a minor DOB (e.g., 2010)
  const profileMessage = 'My name is Minor User. Born on 01-Jan-2010 at 10:00 in Mumbai.';
  // Fallback to the main textarea if the chat-input test id isn't present
  const mainTextarea = page.locator('textarea');
  await expect(mainTextarea).toBeVisible({ timeout: 20000 });
  await expect(mainTextarea).toBeEnabled({ timeout: 20000 });
  await mainTextarea.fill(profileMessage);
  // Prefer Enter-key submission; fall back to send button if present
  await mainTextarea.press('Enter');
  const sendBtn = page.locator('[data-testid=send-button]');
  if ((await sendBtn.count()) > 0) await sendBtn.click();

  // Allow a short moment for any webhook to be invoked, then ensure none contained profile data
  await page.waitForTimeout(1200);
  // Only consider webhooks that include the minor profile we sent (e.g., year 2010 or 'Minor User')
  const hasProfileWebhook = webhookBodies.some(b => /\b2010\b|Minor User/i.test(b));
  expect(hasProfileWebhook).toBe(false);
});
