# UI E2E Tests

End-to-end tests for the Niyati UI using Playwright.

## Quick Start

```bash
# Install dependencies
npm install

# Install browsers (first time only)
npx playwright install

# Run tests
npm test
```

## Test Structure

```
tests/
└── e2e/
    └── complete-flow.spec.js   # All E2E test suites
```

## Test Suites

1. **Login Flow** - User authentication
2. **Profile Creation** - Birth data extraction
3. **Chat Flow** - Message sending/receiving
4. **Complete Astrology Reading** - Full user journey
5. **Responsive Design** - Mobile/tablet/desktop
6. **Error Handling** - Network errors and edge cases

## Available Commands

| Command | Description |
|---------|-------------|
| `npm test` | Run all tests (headless) |
| `npm run test:ui` | Interactive UI mode |
| `npm run test:headed` | Run with visible browser |
| `npm run test:debug` | Step-by-step debugging |
| `npm run test:report` | View HTML report |
| `npm run test:codegen` | Record actions as test code |

## Running Tests

### All Tests
```bash
npm test
```

### Specific Suite
```bash
npx playwright test --grep "Login Flow"
```

### Specific Browser
```bash
npx playwright test --project=chromium
npx playwright test --project=firefox
npx playwright test --project=webkit
```

### Mobile Testing
```bash
npx playwright test --project="Mobile Chrome"
npx playwright test --project="Mobile Safari"
```

## Debugging

### Interactive Mode
```bash
npm run test:ui
```
Browse tests, see traces, and debug interactively.

### Debug Mode
```bash
npm run test:debug
```
Step through tests line by line.

### Generate Tests
```bash
npm run test:codegen
```
Record your actions and generate test code automatically!

## Test Reports

After running tests, view the report:

```bash
npm run test:report
```

The report includes:
- ✅ Test results
- 📸 Screenshots of failures
- 🎥 Videos of failed tests
- 🔍 Trace viewer for debugging

## Writing Tests

### Basic Structure

```javascript
import { test, expect } from '@playwright/test';

test.describe('Feature Name', () => {
  test('should do something', async ({ page }) => {
    await page.goto('/');
    await page.locator('button').click();
    await expect(page.locator('.result')).toBeVisible();
  });
});
```

### Best Practices

1. **Use data-testid attributes**
   ```javascript
   <button data-testid="submit-button">Submit</button>
   
   // In test
   await page.locator('[data-testid="submit-button"]').click();
   ```

2. **Wait for elements**
   ```javascript
   await expect(page.locator('.message')).toBeVisible({ timeout: 5000 });
   ```

3. **Clean setup/teardown**
   ```javascript
   test.beforeEach(async ({ page }) => {
     // Setup before each test
   });
   ```

## CI/CD

Tests run automatically in CI with:
- Chromium (Linux)
- Headless mode
- Retry on failure
- Artifacts uploaded on failure

## Troubleshooting

**Browsers not found:**
```bash
npx playwright install
```

**Flaky tests:**
- Add explicit waits
- Use `toBeVisible()` instead of `waitForTimeout()`
- Increase timeout if needed

**Element not found:**
```javascript
// Add wait
await page.waitForSelector('[data-testid="element"]');
```

See `TESTING.md` in project root for complete documentation.
