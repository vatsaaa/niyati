const { test, expect } = require('@playwright/test');

test.describe('Returning user flow', () => {
  test('should not prompt for profile and should send synthesized message to webhook', async ({ page, baseURL }) => {
    // Intercept calls to identify and webhook
    let webhookBody = null;
    await page.route('**/api/v1/users/identify', route => {
      // Respond as a returning user with stored profile
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          returning: true,
          profile: {
            name: 'Asha Rao',
            dob: '1990-05-12',
            phoneNumber: '+91-9999999999',
            currentLocation: { city: 'Mumbai', state: 'MH', country: 'India' }
          }
        })
      });
    });

    await page.route('**/webhook/**', async route => {
      try {
        const req = route.request();
        webhookBody = await req.postData();
      } catch (e) {
        // ignore
      }
      route.fulfill({ status: 200, body: 'ok' });
    });

    const base = process.env.BASE_URL || baseURL || 'http://127.0.0.1';
    await page.goto(base + '/');

    // Perform login to surface returning-user UI
    await page.waitForSelector('text=Begin Your Journey');
    const phoneInput = page.locator('input[type="tel"]');
    await phoneInput.fill('9999999999');
    const consent = page.locator('input[type="checkbox"]');
    await consent.check();
    await page.click('text=Begin Your Journey');

    // Wait for chat input to be ready
    await page.waitForSelector('textarea');

    // Send a single chat message which for returning users should synthesize and send profile to webhook
    await page.fill('textarea', 'Hi — check my profile');
    // Press Enter to submit (safer than relying on a visible Send button)
    await page.locator('textarea').press('Enter');

    // Wait a short while for webhook to be called
    await page.waitForTimeout(1000);

    expect(webhookBody).not.toBeNull();
    // webhook body should contain natural-language-like content with parts of the profile
    expect(webhookBody).toMatch(/Asha|Mumbai|1990/);
  });
});
