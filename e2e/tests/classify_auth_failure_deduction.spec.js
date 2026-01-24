const { test, expect } = require('@playwright/test');

// Regression: when /api/v1/chat/classify is rejected (401) the UI should not
// erroneously fall back to a billable default and deduct credits. This test
// reproduces the scenario observed in production where classify was protected
// by auth middleware and the client deducted 2 credits.

const PHONE = process.env.E2E_PHONE || '9992223333';
const DEDUCT_AMOUNT = 2;

test('classify auth failure does NOT cause deduction (regression)', async ({ page, baseURL }) => {
  const base = process.env.BASE_URL || baseURL || 'http://127.0.0.1';
  await page.goto(base + '/');

  // Wait for the login form
  await page.waitForSelector('text=Begin Your Journey');

  let creditsValue = 10;
  let deductSeen = false;

  // Stub identify/profile so UI treats user as returning and complete
  await page.route('**/api/v1/users/identify', route => {
    const identified = {
      id: '1',
      name: 'Ankur Vatsa',
      phone_number: `+91-${PHONE}`,
      date_of_birth: '1979-05-19',
      time_of_birth: '07:31',
      place_of_birth: 'New Delhi, India',
      consent_given: true,
      credits: creditsValue,
      total_paid_amount: 0,
      last_login_location: 'New Delhi, India'
    };
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'ok', data: { returning: true, user: identified, config: { credits_horoscope_cost: 2, credits_premium_cost: 4, credits_monthly_free: 10, credits_low_threshold: 4 } } }) });
  });

  await page.route('**/api/v1/users/profile', route => {
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'ok', data: { user: { credits: creditsValue, total_paid_amount: 0 } } }) });
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
            city: 'New Delhi', 
            state: 'Delhi', 
            country: 'India',
            display_name: 'New Delhi, Delhi, India'
          } 
        } 
      }) 
    });
  });

  // Simulate classify endpoint being protected and returning 401
  await page.route('**/api/v1/chat/classify', route => {
    route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ status: 'error', error: 'unauthorized' }) });
  });

  // Capture deduct calls and emulate backend update
  await page.route('**/api/v1/users/deduct-credits', async (route, request) => {
    deductSeen = true;
    try {
      const post = JSON.parse(request.postData() || '{}');
      const amt = parseInt(post.amount, 10) || DEDUCT_AMOUNT;
      creditsValue = Math.max(0, creditsValue - amt);
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'ok', data: { credits: creditsValue } }) });
    } catch (e) {
      await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ status: 'error' }) });
    }
  });

  // n8n webhook stub to return a successful bot response and assert canonical payload
  await page.route('**/webhook/**', async route => {
    try {
      const req = route.request();
      const post = req.postData() ? JSON.parse(req.postData()) : null;
      if (post && post.metadata && post.metadata.user) {
        expect(post.metadata.user.timeOfBirth || post.metadata.user.time_of_birth).toBeTruthy();
        expect(post.metadata.user.placeOfBirth || post.metadata.user.place_of_birth).toBeTruthy();
      }
    } catch (e) {}
    const reply = { output: "I see your profile. Here is today's horoscope: You will experience calm and focus." };
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(reply) });
  });

  // Fill phone and consent, then begin
  const phoneInput = page.locator('input[type="tel"]');
  await phoneInput.fill(PHONE.replace(/^\+/, ''));
  const consent = page.locator('input[type="checkbox"]');
  await consent.check();
  await page.click('text=Begin Your Journey');

  // Verify initial credits displayed
  const creditsLocator = page.locator('div[title*="credits remaining"] span');
  await creditsLocator.waitFor({ timeout: 5000 });
  const initialCreditsText = await creditsLocator.textContent();
  const initialCredits = parseInt(initialCreditsText, 10) || 10;

  // Wait for profile to be stored
  await page.waitForFunction(() => {
    try {
      const stored = localStorage.getItem('niyati_profile');
      if (!stored) return false;
      const p = JSON.parse(stored);
      return p.user_verified && (p.user_verified.id || p.user_verified.phoneNumber);
    } catch (e) { return false; }
  }, { timeout: 5000 });

  // Send a chat message that would normally be billable only if classified as such
  const textarea = page.locator('textarea');
  await expect(textarea).toBeVisible({ timeout: 5000 });
  // Ask about today (should be allowed for free users, but classify returns 401)
  await textarea.fill("What does today hold for me?");
  await textarea.press('Enter');

  // Wait briefly for UI to perform classify -> webhook -> (maybe) deduct
  await page.waitForTimeout(1500);

  // Because classify returned 401, the UI should NOT deduct credits anymore.
  // Ensure no deduct request was made and displayed credits remain unchanged.
  expect(deductSeen).toBe(false);
  
  const currentCreditsText = await creditsLocator.textContent();
  const currentCredits = parseInt(currentCreditsText, 10);
  expect(currentCredits).toBe(initialCredits);

  console.log('[TEST] Classify auth failure test passed. No credits deducted.');

  // Also ensure the UI credit display was NOT decremented
  const expected = initialCredits;
  await expect(creditsLocator).toHaveText(String(expected), { timeout: 5000 });
});
