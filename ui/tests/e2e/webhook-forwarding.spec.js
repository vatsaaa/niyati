import { test, expect } from '@playwright/test';
import { ensureAppReady } from './test-utils';

test.describe('Webhook forwarding behavior', () => {
  test('First-time user should be prompted for missing details and NOT forward to N8N', async ({ page }) => {
    // Ensure no prior profile or phone exists before app loads
    await page.addInitScript(() => {
      try { localStorage.removeItem('niyati_user_profile'); } catch (e) {}
      try { localStorage.removeItem('niyati_user_phone_number'); } catch (e) {}
    });

    // Intercept potential webhook calls and flag if invoked. Match either
    // explicit /webhook/ paths or requests to the local n8n host used in tests.
    let webhookCalled = false;
    await page.route('**/*', async route => {
      const req = route.request();
      const url = req.url();
      const isWebhook = url.includes('/webhook/') || url.includes('localhost:5678');
      if (isWebhook) {
        webhookCalled = true;
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) });
      } else {
        await route.continue();
      }
    });

    // Ensure app is ready
    await ensureAppReady(page);

    // Fill phone and consent
    await page.locator('input[placeholder*="digit number"]').fill('9999999999');
    await page.locator('input[type="checkbox"]').check();
    const loginButton = page.locator('button:has-text("Begin Your Journey")');
    await expect(loginButton).toBeEnabled({ timeout: 5000 });
    await loginButton.click();

    // Send a message that would normally be forwarded
    const chatInput = page.locator('textarea, input[placeholder*="Ask"]').first();
    await expect(chatInput).toBeVisible({ timeout: 15000 });
    await chatInput.fill('My name is Anu and I was born on 1990-01-01 at 10:00 in Pune');
    await chatInput.press('Enter');

    // Expect the UI to prompt for missing fields (name/dob/place/time) instead of forwarding
    await expect(page.locator('text=Could you tell me your full name')).toBeVisible({ timeout: 5000 });
    await expect(webhookCalled).toBeFalsy();
  });

  test('Returning user with complete profile should forward to N8N', async ({ page }) => {
    // Prepare a returning, complete profile in localStorage before loading the app
    const returningProfile = {
      user_name: 'Anu Sharma',
      user_dob: '1990-01-01',
      user_placeOfBirth: 'Pune, India',
      user_timeOfBirth: '10:00:00',
      user_currentLocation: '',
      user_verified: { id: 12345, phoneNumber: '+1-9999999999' },
      user_consentGiven: true
    };

    // Use addInitScript to set localStorage before the app loads
    await page.addInitScript((p) => {
      try { localStorage.setItem('niyati_user_profile', JSON.stringify(p)); } catch (e) {}
      try { localStorage.setItem('niyati_user_phone_number', '+1-9999999999'); } catch (e) {}
    }, returningProfile);

    let webhookCalled = false;
    await page.route('**/*', async route => {
      const req = route.request();
      const url = req.url();
      const isWebhook = url.includes('/webhook/') || url.includes('localhost:5678');
      if (isWebhook) {
        webhookCalled = true;
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ output: 'ok' }) });
      } else {
        await route.continue();
      }
    });

    // Ensure app is ready with returning profile pre-seeded
    await ensureAppReady(page);

    // Ensure chat input is visible and send a message
    const chatInput = page.locator('textarea, input[placeholder*="Ask"]').first();
    await expect(chatInput).toBeVisible({ timeout: 15000 });
    await chatInput.fill('Hello, forward this message');
    await chatInput.press('Enter');

    // The webhook should be called for returning user
    await expect.poll(() => webhookCalled, { timeout: 5000 }).toBeTruthy();
  });
});
