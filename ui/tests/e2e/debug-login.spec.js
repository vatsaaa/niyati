import { test, expect } from '@playwright/test';
import { ensureAppReady } from './test-utils';
import fs from 'fs';

test('debug login with console capture', async ({ page }) => {
  // Capture all console messages
  const consoleMessages = [];
  page.on('console', msg => {
    const text = `[${msg.type()}] ${msg.text()}`;
    consoleMessages.push(text);
    console.log(text);
  });

  // Capture page errors
  page.on('pageerror', error => {
    const text = `[PAGE ERROR] ${error.message}\n${error.stack}`;
    consoleMessages.push(text);
    console.log(text);
  });

  await ensureAppReady(page);
  
  // Wait for the login form
  await expect(page.locator('h1:has-text("Niyati")')).toBeVisible();
  console.log('Login form visible');
  
  // Find and fill the phone number input
  const phoneInput = page.locator('input[type="tel"]').first();
  await phoneInput.fill('9876543210');
  console.log('Phone input filled');
  
  // Check consent checkbox
  const consentCheckbox = page.locator('input[type="checkbox"]');
  const isChecked = await consentCheckbox.isChecked();
  if (!isChecked) {
    await consentCheckbox.click();
    console.log('Consent checkbox clicked');
  }
  
  // Submit the form
  const loginButton = page.locator('button:has-text("Begin Your Journey")');
  console.log('About to click login button');
  await loginButton.click();
  console.log('Login button clicked');
  
  // Wait a bit and capture final state
  await page.waitForTimeout(2000);
  
  // Try to find profile header (use the h2 directly to avoid strict locator ambiguity)
  const profileHeader = page.locator('h2:has-text("Niyati")').first();
  const isVisible = await profileHeader.isVisible().catch(() => false);
  console.log(`Profile header visible: ${isVisible}`);
  
  // Get localStorage state
  const localStorageState = await page.evaluate(() => {
    return {
      phone: localStorage.getItem('niyati_user_phone_number'),
      countryCode: localStorage.getItem('niyati_user_country_code'),
      profile: localStorage.getItem('niyati_user_profile'),
      hasKeys: Object.keys(localStorage).filter(k => k.startsWith('niyati'))
    };
  });
  console.log('LocalStorage state:', JSON.stringify(localStorageState, null, 2));
  
  // Write console logs to file
  fs.writeFileSync(
    'test-results/login-console.log',
    consoleMessages.join('\n')
  );
  
  // Verify we're logged in
  await expect(profileHeader).toBeVisible({ timeout: 5000 });
});
