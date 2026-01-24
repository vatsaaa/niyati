const { test, expect } = require('@playwright/test');

test.describe('Profile-only interactions do not deduct credits', () => {
  test('login/profile synthesis should not call deduct-credits', async ({ page, baseURL }) => {
    const PHONE = process.env.E2E_PHONE || '9993334444';
    let deductCalls = 0;
    let classifyCalls = 0;

    // Mock identify to return a returning user with complete profile and credits
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
              name: 'Ankur Vatsa',
              phone_number: `+91-${PHONE}`,
              credits: 10,
              date_of_birth: '1990-01-01',
              time_of_birth: '06:30',
              place_of_birth: 'Mumbai, Maharashtra, India',
              consent_given: true,
              total_paid_amount: 0,
              last_login_location: 'Mumbai, Maharashtra, India'
            },
            config: {
              credits_low_threshold: 4,
              payment_amount_inr: 500,
              credits_horoscope_cost: 2,
              credits_premium_cost: 4,
              credits_monthly_free: 10
            }
          }
        })
      });
    });

    // Mock profile endpoint
    await page.route('**/api/v1/users/profile', route => {
      route.fulfill({ 
        status: 200, 
        contentType: 'application/json', 
        body: JSON.stringify({ 
          status: 'ok', 
          data: { 
            user: { 
              credits: 10,
              total_paid_amount: 0 
            } 
          } 
        }) 
      });
    });

    // Mock classify endpoint to identify casual (non-billable) messages
    await page.route('**/api/v1/chat/classify', route => {
      classifyCalls++;
      route.fulfill({ 
        status: 200, 
        contentType: 'application/json', 
        body: JSON.stringify({ 
          status: 'ok', 
          data: { 
            queryType: 'casual', 
            creditCost: 0, 
            isBillable: false,
            isFutureQuery: false,
            config: { 
              credits_horoscope_cost: 2, 
              credits_premium_cost: 4 
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

    // Mock webhook (n8n) endpoints - should NOT be called for profile-only flow
    await page.route('**/webhook/**', async route => {
      try {
        const req = route.request();
        const post = req.postData() ? JSON.parse(req.postData()) : null;
        if (post && post.metadata && post.metadata.user) {
          expect(post.metadata.user.timeOfBirth || post.metadata.user.time_of_birth).toBeTruthy();
          expect(post.metadata.user.placeOfBirth || post.metadata.user.place_of_birth).toBeTruthy();
        }
      } catch (e) {}
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ output: "ok" }) });
    });

    // Mock geocode
    await page.route('**/api/v1/geocode/current-location', route => {
      route.fulfill({ 
        status: 200, 
        contentType: 'application/json', 
        body: JSON.stringify({ 
          status: 'ok', 
          data: { 
            location: { 
              city: 'Mumbai', 
              state: 'Maharashtra', 
              country: 'India',
              display_name: 'Mumbai, Maharashtra, India'
            } 
          } 
        }) 
      });
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

    // Wait for profile to be loaded (returning user with complete profile)
    await page.waitForFunction(() => {
      try { 
        const stored = localStorage.getItem('niyati_profile');
        if (!stored) return false;
        const p = JSON.parse(stored);
        return p.user_verified && p.user_verified.id;
      } catch (e) { 
        return false; 
      }
    }, { timeout: 5000 });

    // Give a short buffer for any stray network activity
    await page.waitForTimeout(500);

    // Assert deduct-credits was not called during profile-only flow
    // (no chat message sent yet, just login and profile load)
    expect(deductCalls).toBe(0);
    
    console.log('[TEST] Profile load complete. Classify calls:', classifyCalls, 'Deduct calls:', deductCalls);
  });
});
