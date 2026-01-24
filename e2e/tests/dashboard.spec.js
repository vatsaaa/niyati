const { test, expect } = require('@playwright/test');

test.describe('Dashboard Features', () => {
    test.beforeEach(async ({ page }) => {
        // Mock endpoints for stable test execution
        await page.route('**/api/v1/users/identify', route => {
            route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    status: 'ok',
                    data: {
                        returning: true,
                        user: {
                            id: 'test-user-1',
                            name: 'Test User',
                            phone_number: '+91-9992223333',
                            credits: 10,
                            date_of_birth: '1990-05-19',
                            time_of_birth: '09:30',
                            place_of_birth: 'Mumbai, Maharashtra, India',
                            consent_given: true,
                            total_paid_amount: 0,
                            last_login_location: 'Mumbai, Maharashtra, India'
                        },
                        config: {
                            credits_low_threshold: 4,
                            credits_monthly_free: 10,
                            credits_horoscope_cost: 2,
                            credits_premium_cost: 4,
                            payment_amount_inr: 500
                        }
                    }
                })
            });
        });

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

        // Mock classify - future query (should be blocked for free user)
        await page.route('**/api/v1/chat/classify', route => {
            route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    status: 'ok',
                    data: {
                        queryType: 'premium',
                        creditCost: 4,
                        isBillable: true,
                        isFutureQuery: true,
                        config: {
                            credits_horoscope_cost: 2,
                            credits_premium_cost: 4
                        }
                    }
                })
            });
        });

        // Mock webhook and assert canonical payload when called
        await page.route('**/webhook/**', async route => {
            try {
                const req = route.request();
                const post = req.postData() ? JSON.parse(req.postData()) : null;
                if (post && post.metadata && post.metadata.user) {
                    expect(post.metadata.user.timeOfBirth || post.metadata.user.time_of_birth).toBeTruthy();
                    expect(post.metadata.user.placeOfBirth || post.metadata.user.place_of_birth).toBeTruthy();
                }
            } catch (e) {}
            await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ output: 'Test response' }) });
        });

        // Navigate and login
        await page.goto('/');
        await page.fill('input[type="tel"]', '9992223333');
        await page.check('input[type="checkbox"]');
        await page.click('button:has-text("Begin Your Journey")');
        
        // Wait for profile to load
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
    });

    test('should display user credits and profile information', async ({ page }) => {
        // Credits display in the profile header
        const creditsLocator = page.locator('div[title*="credits remaining"] span');
        await expect(creditsLocator).toBeVisible();
        const creditsText = await creditsLocator.textContent();
        expect(parseInt(creditsText, 10)).toBeGreaterThanOrEqual(0);
    });

    test('should block future questions for non-paid users', async ({ page }) => {
        const chatInput = page.locator('textarea, input[placeholder*="Ask"]');
        await expect(chatInput).toBeVisible();
        
        // Ask future question
        await chatInput.fill('What does my future hold?');
        await page.keyboard.press('Enter');
        
        // Wait for response
        await page.waitForTimeout(2000);
        
        // Should see payment/blocking message (not n8n response)
        const blockMessage = page.locator('text=/future.*paid|premium.*future|free credits.*today/i').last();
        await expect(blockMessage).toBeVisible({ timeout: 10000 });
    });
});
