const { test, expect } = require('@playwright/test');

test.describe('Social Login Flow', () => {
    test('should redirect to Google login and handle callback', async ({ page }) => {
        // Navigate to login page
        await page.goto('/');

        // Check for Google login button
        const googleBtn = page.locator('button:has-text("Google")');
        await expect(googleBtn).toBeVisible();

        // Click Google login button (should redirect to /api/v1/auth/google)
        // In a test environment without real OAuth, we expect a redirect 
        // to a stub or a mock callback
        await googleBtn.click();

        // Check if we reached the callback or a success state
        // Since we use stub tokens in dev/test, we might be logged in immediately
        await expect(page).toHaveURL(/.*dashboard|.*callback|.*google.*/);
    });

    test('should show GitHub and Apple login buttons', async ({ page }) => {
        await page.goto('/');
        await expect(page.locator('button:has-text("GitHub")')).toBeVisible();
        await expect(page.locator('button:has-text("Apple")')).toBeVisible();
    });
});
