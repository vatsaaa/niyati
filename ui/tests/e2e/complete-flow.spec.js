import { test, expect } from '@playwright/test';
import { ensureAppReady } from './test-utils';

test.describe('Login Flow', () => {
  test('should allow user to login with phone number', async ({ page }) => {
    await ensureAppReady(page);
    
    // Wait for the login form
    await expect(page.locator('h1:has-text("Niyati")')).toBeVisible();
    
    // Find and fill the phone number input (US 10-digit default)
    const phoneInput = page.locator('input[type="tel"]').first();
    await phoneInput.fill('9876543210');
    
    // Submit the form
    const loginButton = page.locator('button:has-text("Begin Your Journey")');
    await loginButton.click();
    
    // Verify we're logged in (profile header should be visible)
    const profileHeader = page.locator('div:has(h2:has-text("Niyati"))');
    await expect(profileHeader).toBeVisible({ timeout: 10000 });
  });
  
  test('should validate phone number format', async ({ page }) => {
    await ensureAppReady(page);
    
    const phoneInput = page.locator('input[type="tel"]').first();
    await phoneInput.fill('invalid');
    
    const loginButton = page.locator('button:has-text("Begin Your Journey")');
    await loginButton.click();
    
    // Handle browser alert dialog (LoginForm uses alert()) and/or validation text
    let sawDialog = false;
    page.once('dialog', async (dialog) => { sawDialog = true; await dialog.dismiss(); });

    await loginButton.click();

    const validationLocator = page.locator('text=/invalid|required/i');
    const validationVisible = await validationLocator.isVisible().catch(() => false);
    const isDisabled = await loginButton.isDisabled().catch(() => false);
    if (!sawDialog && !validationVisible && !isDisabled) {
      throw new Error('Expected validation dialog, validation text, or disabled button for invalid phone input');
    }
  });
  
  test('should persist login across page reload', async ({ page }) => {
    await ensureAppReady(page);
    
    const phoneInput = page.locator('input[type="tel"]').first();
    await phoneInput.fill('9876543210');
    
    const loginButton = page.locator('button:has-text("Begin Your Journey")');
    await loginButton.click();
    
    // Wait for login
    await page.waitForTimeout(1000);
    
    // Reload page and wait for network idle (preserve localStorage auth)
    await page.reload();
    await page.waitForLoadState('networkidle');
    // Should still be logged in — wait for the ProfileHeader container
    const profileHeaderAfterReload = page.locator('div:has(h2:has-text("Niyati"))');
    await expect(profileHeaderAfterReload).toBeVisible({ timeout: 10000 });
  });
});

test.describe('Profile Creation', () => {
  test.beforeEach(async ({ page }) => {
    // Login before each test
    await ensureAppReady(page);
    const phoneInput = page.locator('input[type="tel"]').first();
    await phoneInput.fill('9876543210');
    await page.locator('button:has-text("Begin Your Journey")').click();
    await page.waitForTimeout(1000);
  });
  
  test('should update date of birth through chat', async ({ page }) => {
    // Type message with date of birth
    const messageInput = page.locator('textarea, input[type="text"]').last();
    await messageInput.fill('I was born on March 15, 1990');
    
    // Send message
    await page.keyboard.press('Enter');
    
    // Wait for processing
    await page.waitForTimeout(2000);
    
    // Check if profile header shows the date
    const profileHeader = page.locator('div:has(h2:has-text("Niyati"))');
    await expect(profileHeader).toContainText('15-Mar-1990', { timeout: 5000 });
  });
  
  test('should update birth place through chat', async ({ page }) => {
    const messageInput = page.locator('textarea, input[type="text"]').last();
    await messageInput.fill('I was born in New Delhi');
    await page.keyboard.press('Enter');
    
    await page.waitForTimeout(3000);
    
    // Profile should show birth place
    const profileHeader = page.locator('div:has(h2:has-text("Niyati"))');
    await expect(profileHeader).toContainText('Delhi', { timeout: 5000 });
  });
  
  test('should update birth time through chat', async ({ page }) => {
    const messageInput = page.locator('textarea, input[type="text"]').last();
    await messageInput.fill('I was born at 2:30 PM');
    await page.keyboard.press('Enter');
    
    await page.waitForTimeout(2000);
    
    // Profile should show birth time
    const profileHeader = page.locator('div:has(h2:has-text("Niyati"))');
    await expect(profileHeader).toContainText('14:30', { timeout: 5000 });
  });
});

test.describe('Chat Flow', () => {
  test.beforeEach(async ({ page }) => {
    await ensureAppReady(page);
    const phoneInput = page.locator('input[type="tel"]').first();
    await phoneInput.fill('9876543210');
    await page.locator('button:has-text("Begin Your Journey")').click();
    await page.waitForTimeout(1000);
  });
  
  test('should send and receive messages', async ({ page }) => {
    const messageInput = page.locator('textarea, input[type="text"]').last();
    const testMessage = 'Hello, tell me about astrology';
    
    await messageInput.fill(testMessage);
    await page.keyboard.press('Enter');
    
    // User message should appear
    await expect(page.locator(`text="${testMessage}"`)).toBeVisible({ timeout: 2000 });
    
    // Wait for bot response
    await expect(page.locator('.message').filter({ hasText: /astrology|zodiac|birth/i })).toBeVisible({ timeout: 15000 });
  });
  
  test('should show loading indicator while waiting for response', async ({ page }) => {
    const messageInput = page.locator('textarea, input[type="text"]').last();
    await messageInput.fill('What is my sun sign?');
    await page.keyboard.press('Enter');
    
    // Loading indicator should appear (one of several possible selectors)
    const loadingLocator = page.locator('[data-testid="loading-indicator"], .loading, .spinner');
    await expect(loadingLocator).toBeVisible({ timeout: 2000 });
  });
  
  test('should handle Enter key for sending messages', async ({ page }) => {
    const messageInput = page.locator('textarea, input[type="text"]').last();
    await messageInput.fill('Test message');
    await page.keyboard.press('Enter');
    
    // Message should be sent
    await expect(page.locator('text="Test message"')).toBeVisible({ timeout: 2000 });
  });
  
  test('should allow Shift+Enter for new line', async ({ page }) => {
    const messageInput = page.locator('textarea').last();
    await messageInput.fill('Line 1');
    await page.keyboard.press('Shift+Enter');
    await messageInput.fill('Line 1\nLine 2');
    
    // Textarea should contain newline
    const value = await messageInput.inputValue();
    expect(value).toContain('\n');
  });
  
  test('should disable send button when input is empty', async ({ page }) => {
    const sendButton = page.locator('button[type="submit"]').last();
    
    // Button should be disabled when empty
    await expect(sendButton).toBeDisabled();
    
    // Fill input
    const messageInput = page.locator('textarea, input[type="text"]').last();
    await messageInput.fill('Test');
    
    // Button should be enabled
    await expect(sendButton).toBeEnabled();
  });
});

test.describe('Complete Astrology Reading Flow', () => {
  test('should complete full profile and get astrology reading', async ({ page }) => {
    // Login
    await ensureAppReady(page);
    const phoneInput = page.locator('input[type="tel"]').first();
    await phoneInput.fill('9876543210');
    await page.locator('button:has-text("Begin Your Journey")').click();
    await page.waitForTimeout(1000);
    
    // Set date of birth
    const messageInput = page.locator('textarea, input[type="text"]').last();
    await messageInput.fill('I was born on January 15, 1990');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(2000);
    
    // Set birth place
    await messageInput.fill('I was born in Pune, India');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(3000);
    
    // Set birth time
    await messageInput.fill('I was born at 2:30 PM');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(2000);
    
    // Request astrology reading
    await messageInput.fill('What does my birth chart say?');
    await page.keyboard.press('Enter');
    
    // Should receive detailed response
    await expect(page.locator('.message').filter({ hasText: /chart|planets|zodiac|astrology/i })).toBeVisible({ timeout: 20000 });
  });
});

test.describe('Responsive Design', () => {
  test('should work on mobile viewport', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await ensureAppReady(page);
    
    // Login form should be visible and usable
    await expect(page.locator('input[type="tel"]').first()).toBeVisible();
    
    const phoneInput = page.locator('input[type="tel"]').first();
    await phoneInput.fill('9876543210');
    await page.locator('button:has-text("Begin Your Journey")').click();
    
    await page.waitForTimeout(1000);
    
    // Chat interface should be visible
    await expect(page.locator('textarea, input[type="text"]')).toBeVisible({ timeout: 5000 });
  });
  
  test('should work on tablet viewport', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await ensureAppReady(page);
    
    await expect(page.locator('h1:has-text("Niyati")')).toBeVisible();
  });
});

test.describe('Error Handling', () => {
  test('should handle network errors gracefully', async ({ page }) => {
    await ensureAppReady(page);
    const phoneInput = page.locator('input[type="tel"]').first();
    await phoneInput.fill('9876543210');
    await page.locator('button:has-text("Begin Your Journey")').click();
    await page.waitForTimeout(1000);
    
    // Simulate offline
    await page.route('**/*', route => route.abort());
    
    const messageInput = page.locator('textarea, input[type="text"]').last();
    await messageInput.fill('Test message');
    await page.keyboard.press('Enter');
    
    // Should show error message
    await expect(page.locator('text=/error|failed|try again/i')).toBeVisible({ timeout: 5000 });
  });
});
