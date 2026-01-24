const { test, expect } = require('@playwright/test');

// Browser-driven e2e: open UI, perform login/identify, send a chat, and verify credits update.
const PHONE = process.env.E2E_PHONE || '9992223333';
const DEDUCT_AMOUNT = 2;
const REAL = process.env.REAL === '1';

test('ui identify -> chat -> credits deducted', async ({ page, baseURL }) => {
  const base = process.env.BASE_URL || baseURL || 'http://127.0.0.1';


  // Set up route intercepts BEFORE navigating to the page
  let creditsValue = 10;
  const networkRequests = [];
  const networkResponses = [];
  const consoleLogs = [];

  if (REAL) {
    page.on('request', req => {
      networkRequests.push({ method: req.method(), url: req.url(), postData: req.postData() });
    });
    page.on('response', async res => {
      let body = '';
      try { body = await res.text(); } catch (e) { body = `<unreadable: ${e.message}>`; }
      networkResponses.push({ url: res.url(), status: res.status(), body: body.slice(0, 2000) });
    });
    page.on('console', msg => {
      try {
        consoleLogs.push({ type: msg.type(), text: msg.text() });
      } catch (e) {
        consoleLogs.push({ type: 'unknown', text: String(msg) });
      }
    });
    // In REAL mode behind Caddy (CI), we do NOT intercept /api/** calls — Caddy reverse proxies them.
    // Only intercept the external n8n webhook in REAL mode and return a deterministic bot reply
    await page.route('**/webhook/**', async route => {
      try {
        const req = route.request();
        const post = req.postData() ? JSON.parse(req.postData()) : null;
        if (post && post.metadata && post.metadata.user) {
          expect(post.metadata.user.timeOfBirth || post.metadata.user.time_of_birth).toBeTruthy();
          expect(post.metadata.user.placeOfBirth || post.metadata.user.place_of_birth).toBeTruthy();
        }
      } catch (e) {}
      const reply = { output: "I see your profile. Here is today's horoscope: You will feel a gentle clarity today." };
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(reply) });
    });
  } else {
    // Stub geocode current-location to avoid network delay
    await page.route('**/api/v1/geocode/current-location', route => {
      route.fulfill({ 
        status: 200, 
        contentType: 'application/json',
        body: JSON.stringify({ status: 'ok', data: { location: { city: 'Mumbai', state: 'Maharashtra', country: 'India', display_name: 'Mumbai, Maharashtra, India' } } })
      });
    });

    // Deterministic stubbing: provide a full returning profile so UI considers the user 'complete'
    // Use full path pattern to match /api/v1/users/identify
    await page.route('**/api/v1/users/identify', route => {
      const identified = {
        id: '1',
        name: 'Ankur Vatsa',
        phone_number: `+91-${PHONE}`,
        date_of_birth: '1990-05-19',
        time_of_birth: '09:30',
        place_of_birth: 'Mumbai, Maharashtra, India',
        consent_given: true,
        credits: creditsValue,
        total_paid_amount: 0,
        last_login_location: 'Mumbai, Maharashtra, India'
      };
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'ok', data: { returning: true, user: identified, config: { credits_monthly_free: 10, credits_low_threshold: 4, credits_horoscope_cost: 2, credits_premium_cost: 4 } } }) });
    });

    await page.route('**/api/v1/users/profile', route => {
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'ok', data: { user: { credits: creditsValue, total_paid_amount: 0 } } }) });
    });

    // Mock classify endpoint - today's horoscope query
    await page.route('**/api/v1/chat/classify', async (route, request) => {
      const body = JSON.parse(request.postData() || '{}');
      const message = (body.message || '').toLowerCase();
      
      const isFuture = message.includes('future') || message.includes('tomorrow');
      const queryType = isFuture ? 'premium' : 'horoscope';
      const creditCost = isFuture ? 4 : 2;
      
      await route.fulfill({ 
        status: 200, 
        contentType: 'application/json', 
        body: JSON.stringify({ 
          status: 'ok', 
          data: { 
            queryType, 
            creditCost, 
            isBillable: true,
            isFutureQuery: isFuture,
            config: { credits_horoscope_cost: 2, credits_premium_cost: 4 }
          } 
        }) 
      });
    });

    // Deduct endpoint: update in-memory creditsValue and return updated credits
    await page.route('**/api/v1/users/deduct-credits', async (route, request) => {
      try {
        const post = JSON.parse(request.postData() || '{}');
        const amt = parseInt(post.amount, 10) || DEDUCT_AMOUNT;
        creditsValue = Math.max(0, creditsValue - amt);
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'ok', data: { credits: creditsValue } }) });
      } catch (e) {
        await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ status: 'error' }) });
      }
    });
    // Also stub the n8n webhook so the client receives a bot response and proceeds to deduct credits
    await page.route('**/webhook/**', async route => {
      try {
        const req = route.request();
        const post = req.postData() ? JSON.parse(req.postData()) : null;
        if (post && post.metadata && post.metadata.user) {
          expect(post.metadata.user.timeOfBirth || post.metadata.user.time_of_birth).toBeTruthy();
          expect(post.metadata.user.placeOfBirth || post.metadata.user.place_of_birth).toBeTruthy();
        }
      } catch (e) {}
      const reply = { output: "I see your profile. Here is today's horoscope: You will experience a calm and focused day." };
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(reply) });
    });
  }

  // Navigate to page AFTER route intercepts are set up
  await page.goto(base + '/');
  await page.waitForSelector('text=Begin Your Journey');

  // Fill phone number and consent, then begin
  const phoneInput = page.locator('input[type="tel"]');
  await phoneInput.fill(PHONE.replace(/^\+/, ''));
  const consent = page.locator('input[type="checkbox"]');
  await consent.check();
  await page.click('text=Begin Your Journey');

  // Credits display in the profile header
  const creditsLocator = page.locator('div[title*="credits remaining"] span');
  await creditsLocator.waitFor({ timeout: 5000 });
  const initialCreditsText = await creditsLocator.textContent();
  const initialCredits = parseInt(initialCreditsText, 10) || 10;

  // Type a chat message and submit
  const textarea = page.locator('textarea');

  // Wait for profile to be populated in localStorage
  // In REAL mode, provide profile details via the chat input so the client can persist them.
  if (REAL) {
    await textarea.fill("My name is Ankur Vatsa. Date of birth: 1990-05-19. Time of birth: 09:30. Place of birth: Mumbai, Maharashtra, India");
    await textarea.press('Enter');
    // Give the UI a moment to process and update profile before sending the query
    await page.waitForTimeout(1500);
    // Ask about today's horoscope (allowed for free users)
    await textarea.fill("What does today hold for me?");
  } else {
    // For stubbed mode, user profile is already complete (returning user)
    await page.waitForFunction(() => {
      try {
        const stored = localStorage.getItem('niyati_profile');
        if (!stored) return false;
        const p = JSON.parse(stored);
        return p.user_verified && (p.user_verified.id || p.user_verified.phoneNumber);
      } catch (e) { return false; }
    }, { timeout: 15000 });
  }
  // Ensure the textarea is visible and enabled before typing to avoid flakiness
  await expect(textarea).toBeVisible({ timeout: 5000 });
  await expect(textarea).toBeEnabled({ timeout: 5000 });
  // If running REAL, first provide profile details so the client can extract and persist them,
  // then request the horoscope. This ensures the n8n greeting doesn't ask for DOB/place again.
  if (REAL) {
    await textarea.fill("My name is Ankur. Date of birth: 1990-05-19. Time of birth: 09:30. Place of birth: Mumbai, India");
    await textarea.press('Enter');
    // Give the UI a moment to process and update profile before sending the query
    await page.waitForTimeout(1200);
    await textarea.fill("Hi Niyati, give me today's horoscope");
  } else {
    await textarea.fill("Hi Niyati, give me today's horoscope");
  }

  // Start waiting for the deduct request to be issued by the UI
  const deductRequestPromise = page.waitForRequest('**/api/v1/users/deduct-credits', { timeout: 12000 }).catch(() => null);
  // Submit the chat via Enter key to avoid accidentally clicking the login form submit
  await textarea.press('Enter');

  // Wait for deduct request (if any) and also allow the UI to update
  const deductReq = await deductRequestPromise;

  // If REAL run, print captured network/console logs to help diagnose missing deduct call
  if (REAL) {
    // Wait a short while for any late responses
    await page.waitForTimeout(2000);
    console.log('\n=== PLAYWRIGHT CAPTURED CONSOLE LOGS ===');
    for (const c of consoleLogs) console.log(JSON.stringify(c));
    console.log('\n=== PLAYWRIGHT CAPTURED REQUESTS ===');
    for (const r of networkRequests) console.log(JSON.stringify(r));
    console.log('\n=== PLAYWRIGHT CAPTURED RESPONSES (truncated) ===');
    for (const r of networkResponses) console.log(JSON.stringify(r));
    console.log('\n=== DEDUCT REQUEST SEEN ===', !!deductReq);
  }

  // Wait until the credits element updates to the expected value (if deduct happened)
  const expected = Math.max(0, initialCredits - DEDUCT_AMOUNT);
  if (deductReq) {
    await expect(creditsLocator).toHaveText(String(expected), { timeout: 5000 });
  } else if (!REAL) {
    // Non-REAL deterministic mode should always see deduct
    await expect(creditsLocator).toHaveText(String(expected), { timeout: 5000 });
  } else {
    // In REAL mode if deduct did not occur, fail with captured logs
    throw new Error('No /api/v1/users/deduct-credits request observed in REAL run. See logs above.');
  }
});
