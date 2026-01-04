const { test, expect } = require('@playwright/test');

test.describe('Profile-only interactions do not deduct credits', () => {
  test('login/profile synthesis should not call deduct-credits', async ({ page, baseURL }) => {
    const PHONE = process.env.E2E_PHONE || '9993334444';
    let deductCalls = 0;

    // Mock identify to return a returning user with credits
    await page.route('**/api/v1/users/identify', route => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          status: 'ok',
          data: {
            returning: true,
            user: {
              id: 'return-1',
              name: 'Returning User',
              phone_number: `+91-${PHONE}`,
              credits: 10,
              date_of_birth: '1990-01-01',
              time_of_birth: '06:30',
              place_of_birth: 'Mumbai, MH, India',
              consent_given: true
            },
            config: {
              credits_low_threshold: 4,
              payment_amount_inr: 500
            }
          }
        })
      });
    });

    // Intercept deduct-credits and count calls
    await page.route('**/api/v1/users/deduct-credits', route => {
      deductCalls++;
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'ok', data: { credits: 10 } }) });
    });

    // Mock webhook (n8n) endpoints
    await page.route('**/webhook/**', route => {
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ output: "ok" }) });
    });

    const base = process.env.BASE_URL || baseURL || 'http://127.0.0.1';
    await page.goto(base + '/');

    await page.waitForSelector('text=Begin Your Journey');

    // Perform login/start journey
    const phoneInput = page.locator('input[type="tel"]');
    await phoneInput.fill(PHONE);
    const consent = page.locator('input[type="checkbox"]');
    await consent.check();
    await page.click('text=Begin Your Journey');

    // Wait for chat textarea to appear
    await page.waitForSelector('textarea');

    // Wait for synthesized profile to be marked as sent in localStorage (set by UI)
    await page.waitForFunction(() => {
      try { return localStorage.getItem('niyati_profile_sent') === 'true'; } catch (e) { return false; }
    }, { timeout: 5000 });

    // Give a short buffer for any stray network activity
    await page.waitForTimeout(500);

    // Assert deduct-credits was not called during profile-only flow
    expect(deductCalls).toBe(0);
  });
});
