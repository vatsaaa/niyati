const { test, expect } = require('@playwright/test');

test.describe('Returning user flow', () => {
  test('should not prompt for profile and should send synthesized message to webhook', async ({ page, baseURL }) => {
    // Intercept calls to identify and webhook
    let webhookBodies = [];
    await page.route('**/api/v1/users/identify', route => {
      // Respond as a returning user with stored profile (API-shaped)
      // Include all required fields so the UI sends a synthesized profile to webhook
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          status: 'ok',
          data: {
            returning: true,
            user: {
              id: 'returning-as-asha',
              name: 'Asha Rao',
              date_of_birth: '1990-05-12',
              time_of_birth: '10:30:00',
              place_of_birth: 'Mumbai',
              phone_number: '+91-9999999999',
              consent_given: true,
              credits: 10,
              total_paid_amount: 0,
              last_login_location: 'Mumbai, Maharashtra, India'
            },
            config: {
              credits_monthly_free: 10,
              credits_low_threshold: 4,
              payment_amount_inr: 500
            }
          }
        })
      });
    });

    // Intercept webhook calls - must return valid JSON for the UI to parse
    await page.route('**/webhook/**', async route => {
      try {
        const req = route.request();
        const body = req.postData();
        if (body) webhookBodies.push(body);
      } catch (e) {
        // ignore
      }
      // Return valid JSON response that the UI expects
      route.fulfill({ 
        status: 200, 
        contentType: 'application/json',
        body: JSON.stringify({ output: 'Hello Asha! Welcome back to Niyati.' }) 
      });
    });
    
    // Also mock the profile endpoint
    await page.route('**/api/v1/users/profile', route => {
      route.fulfill({ 
        status: 200, 
        contentType: 'application/json',
        body: JSON.stringify({ status: 'ok', data: { user: { credits: 10 } } }) 
      });
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
    await page.waitForTimeout(2000);

    // At least one webhook call should have been made with profile data
    expect(webhookBodies.length).toBeGreaterThan(0);
    // At least one webhook body should contain profile parts (name, place, or year)
    const hasProfileData = webhookBodies.some(body => /Asha|Mumbai|1990/.test(body));
    expect(hasProfileData).toBeTruthy();
  });
});
