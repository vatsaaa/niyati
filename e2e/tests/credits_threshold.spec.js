const { test, expect } = require('@playwright/test');

test.describe('Credits threshold and payment prompt', () => {
  test('shows payment QR/instructions when credits below threshold', async ({ page, baseURL }) => {
    const PHONE = process.env.E2E_PHONE || '9992223333';

    // Mock identify with low credits (<6)
    await page.route('**/api/v1/users/identify', route => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          status: 'ok',
          data: {
            returning: true,
            user: {
              id: 'credits-low-1',
              name: 'Low Credit User',
              phone_number: `+91-${PHONE}`,
              credits: 5,
              date_of_birth: '1990-01-01',
              time_of_birth: '06:30',
              place_of_birth: 'Mumbai, MH, India',
              consent_given: true
            },
            config: {
              credits_low_threshold: 6,
              payment_amount_inr: 500
            }
          }
        })
      });
    });

    // Mock webhook simply
    await page.route('**/webhook/**', async route => {
      route.fulfill({ status: 200, body: JSON.stringify({ output: 'ok' }) });
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

    // Wait for chat
    await page.waitForSelector('textarea');

    // Payment prompt for low-credit returning users is shown on login; wait briefly
    await page.waitForTimeout(1500);

    // Check for payment prompt / QR presence using multiple strategies:
    // 1. Check localStorage flag
    // 2. Check for QR image or payment text in DOM
    const result = await page.evaluate(() => {
      const qrFlag = localStorage.getItem('niyati_payment_qr_shown');
      const hasQrImage = !!document.querySelector('img[src*="PayQR"], img[src*="payment"]');
      const hasPaymentText = document.body.innerText.includes('scan the QR') || 
                            document.body.innerText.includes('UPI') ||
                            document.body.innerText.includes('payment');
      return { qrFlag, hasQrImage, hasPaymentText };
    });

    // Payment prompt shown if any indicator is present
    const paymentPromptShown = result.qrFlag === 'true' || result.qrFlag === '1' || 
                               result.hasQrImage || result.hasPaymentText;
    expect(paymentPromptShown).toBeTruthy();
  });
});
