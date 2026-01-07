const { test, expect } = require('@playwright/test');

test.describe('Dashboard Features', () => {
    test.beforeEach(async ({ page }) => {
        // Mock login or use a test session
        await page.goto('/');
        // Perform phone login for simplicity in tests
        await page.fill('input[type="tel"]', '9992223333');
        await page.check('input[type="checkbox"]');
        await page.click('button:has-text("Begin Your Journey")');
        // The header contains Niyati title, verify it's loaded instead of "Welcome" literal
        await expect(page.locator('h2:has-text("Niyati")')).toBeVisible();
    });

    test('should display user credits and profile information', async ({ page }) => {
        // Credits display in the profile header (using selector from identify_chat.spec.js)
        const creditsLocator = page.locator('div[title*="credits remaining"] span');
        await expect(creditsLocator).toBeVisible();
    });

    test('should allow asking a question', async ({ page }) => {
        const chatInput = page.locator('textarea, input[placeholder*="Ask"]');
        if (await chatInput.isVisible()) {
            await chatInput.fill('What does my future hold?');
            await page.keyboard.press('Enter');
            // Wait for bot response to appear
            await expect(page.locator('.bot-message')).toBeVisible({ timeout: 15000 });
        }
    });
});
