# Testing Infrastructure Guide

Complete guide for running tests in the Niyati application.

## Table of Contents
- [Overview](#overview)
- [BFF Testing (Backend)](#bff-testing-backend)
- [UI Testing (Frontend)](#ui-testing-frontend)
- [Load Testing](#load-testing)
- [Continuous Integration](#continuous-integration)
- [Best Practices](#best-practices)

---

## Overview

The Niyati project uses a comprehensive testing strategy:

- **Unit Tests** (BFF): Jest for testing individual functions and services
- **Integration Tests** (BFF): Supertest for testing API endpoints
- **E2E Tests** (UI): Playwright for testing complete user flows
- **Load Tests** (BFF): Artillery for performance and stress testing

**Coverage Goals:**
- Services: 80%+
- Routes: 90%+
- Utilities: 95%+

---

## BFF Testing (Backend)

### Setup

Tests are already configured. To run them:

```bash
cd be/bff
npm test
```

### Test Commands

```bash
# Run all tests
npm test

# Run only unit tests
npm run test:unit

# Run only integration tests
npm run test:integration

# Run tests in watch mode (auto-rerun on file changes)
npm run test:watch

# Generate coverage report
npm run test:coverage

# Run all tests (unit + integration)
npm run test:all
```

### Unit Tests

Located in `be/bff/tests/unit/`

**Example: Testing the Geocode Service**

```bash
npm run test:unit -- geocodeService
```

**What it tests:**
- Valid location geocoding
- Invalid location handling
- Empty/null input validation
- International locations
- Special characters in location names
- Caching behavior

**Example test:**
```javascript
it('should return coordinates for valid location', async () => {
  const result = await geocodeService.geocode('Pune, India');
  
  expect(result).toBeDefined();
  expect(result).toHaveProperty('place');
  expect(result.place.lat).toBeCloseTo(18.5, 0);
  expect(result.place.lon).toBeCloseTo(73.8, 0);
});
```

### Integration Tests

Located in `be/bff/tests/integration/`

**Example: Testing API Endpoints**

```bash
npm run test:integration
```

**What it tests:**
- HTTP request/response cycle
- Error handling
- Rate limiting
- Content-type headers
- Authentication (when implemented)

**Example test:**
```javascript
it('should return geocoded location for valid input', async () => {
  const response = await request(app)
    .post('/api/v1/geocode')
    .send({ location: 'Pune, India' })
    .expect(200);
  
  expect(response.body).toHaveProperty('place');
});
```

### Coverage Report

After running `npm run test:coverage`, open the report:

```bash
# macOS
open coverage/lcov-report/index.html

# Linux
xdg-open coverage/lcov-report/index.html

# Windows
start coverage/lcov-report/index.html
```

**Coverage output shows:**
- Line coverage
- Branch coverage
- Function coverage
- Statement coverage

### Writing New Tests

**1. Create test file:**

```bash
# For services
touch be/bff/tests/unit/services/newService.test.js

# For routes
touch be/bff/tests/integration/newRoute.test.js
```

**2. Follow the pattern:**

```javascript
const myService = require('../../../src/services/myService');

describe('MyService', () => {
  describe('methodName', () => {
    it('should do something specific', async () => {
      const result = await myService.methodName(input);
      expect(result).toBeDefined();
    });
    
    it('should handle errors', async () => {
      await expect(myService.methodName(null))
        .rejects
        .toThrow();
    });
  });
});
```

**3. Run your new tests:**

```bash
npm run test:watch
```

---

## UI Testing (Frontend)

### Setup

Playwright is already installed. To initialize browsers:

```bash
cd ui
npx playwright install
```

This downloads Chrome, Firefox, and WebKit browsers.

### Test Commands

```bash
# Run all E2E tests (headless)
npm test

# Run tests with UI mode (interactive)
npm run test:ui

# Run tests in headed mode (see browser)
npm run test:headed

# Debug tests step-by-step
npm run test:debug

# View test report
npm run test:report

# Generate test code by recording actions
npm run test:codegen
```

### E2E Tests

Located in `ui/tests/e2e/`

**Test suites:**

1. **Login Flow**
   - Phone number validation
   - Login persistence
   - Session management

2. **Profile Creation**
   - Date of birth extraction
   - Birth place geocoding
   - Birth time parsing

3. **Chat Flow**
   - Sending messages
   - Receiving responses
   - Loading indicators
   - Keyboard shortcuts

4. **Complete Astrology Reading**
   - Full profile completion
   - Astrology data retrieval
   - Response formatting

5. **Responsive Design**
   - Mobile viewport (375x667)
   - Tablet viewport (768x1024)
   - Desktop viewport

6. **Error Handling**
   - Network errors
   - API failures
   - Invalid inputs

### Running Specific Tests

```bash
# Run only login tests
npx playwright test --grep "Login Flow"

# Run only mobile tests
npx playwright test --grep "mobile"

# Run on specific browser
npx playwright test --project=chromium

# Run on mobile Chrome
npx playwright test --project="Mobile Chrome"
```

### Debugging Tests

**Interactive UI Mode:**
```bash
npm run test:ui
```

**Debug Mode (step through):**
```bash
npm run test:debug
```

**Generate test code:**
```bash
npm run test:codegen
```
This opens a browser and records your actions as test code!

### Test Reports

After running tests, view the HTML report:

```bash
npm run test:report
```

**Report includes:**
- Test results
- Screenshots of failures
- Videos of failed tests
- Trace viewer for debugging

### Writing New E2E Tests

**1. Create test file:**

```bash
touch ui/tests/e2e/my-feature.spec.js
```

**2. Write test:**

```javascript
import { test, expect } from '@playwright/test';

test.describe('My Feature', () => {
  test('should do something', async ({ page }) => {
    await page.goto('/');
    
    // Find element
    const button = page.locator('button:has-text("Click me")');
    
    // Interact
    await button.click();
    
    // Assert
    await expect(page.locator('.result')).toBeVisible();
  });
});
```

**3. Run it:**

```bash
npm run test:headed -- my-feature
```

### Playwright Selectors

**Common patterns:**

```javascript
// By text
page.locator('text="Login"')
page.locator('button:has-text("Submit")')

// By test ID
page.locator('[data-testid="profile-header"]')

// By CSS
page.locator('.message-user')
page.locator('#chat-input')

// By role
page.getByRole('button', { name: 'Send' })
page.getByRole('textbox')

// Combined
page.locator('form').locator('input[type="email"]')
```

---

## Load Testing

### Setup

Install Artillery globally:

```bash
npm install -g artillery
```

Or use it locally:

```bash
cd be/bff
npm run test:load
```

### Running Load Tests

```bash
# Basic load test
cd be/bff
artillery run tests/load/baseline.yml

# With custom target
artillery run --target http://localhost:3000 tests/load/baseline.yml

# Generate HTML report
artillery run tests/load/baseline.yml --output report.json
artillery report report.json
```

### Load Test Scenarios

The baseline test simulates:

**Phase 1: Warm up (30s)**
- 5 requests/second
- Gradual start

**Phase 2: Sustained load (60s)**
- 20 requests/second
- Normal operation

**Phase 3: Peak load (30s)**
- 50 requests/second
- Stress test

**Phase 4: Cool down (30s)**
- 5 requests/second
- Recovery

### Test Scenarios

1. **Health Check** (20% weight)
   - GET `/api/v1/telemetry/health`

2. **Service Info** (10% weight)
   - GET `/api/v1/telemetry/info`

3. **Geocode Request** (50% weight)
   - POST `/api/v1/geocode`
   - Random locations

4. **Client Logging** (20% weight)
   - POST `/api/v1/telemetry/log`

### Performance Thresholds

Tests fail if:
- Error rate > 1%
- p95 latency > 500ms
- p99 latency > 1000ms

### Interpreting Results

```
Summary report:
  http.codes.200: 5420
  http.request_rate: 45/sec
  http.response_time:
    min: 12
    max: 1234
    median: 87
    p95: 345
    p99: 678
```

**What to look for:**
- ✅ **200 codes**: Successful requests
- ✅ **Request rate**: Matches expected load
- ✅ **p95 < 500ms**: Most requests are fast
- ❌ **p99 > 1000ms**: Some requests are slow (investigate)

### Creating Custom Load Tests

**1. Create YAML file:**

```bash
touch be/bff/tests/load/custom.yml
```

**2. Define scenarios:**

```yaml
config:
  target: 'http://localhost:3000'
  phases:
    - duration: 60
      arrivalRate: 10

scenarios:
  - name: "My Test"
    flow:
      - post:
          url: "/api/v1/my-endpoint"
          json:
            data: "test"
```

**3. Run it:**

```bash
artillery run tests/load/custom.yml
```

---

## Continuous Integration

### GitHub Actions Example

Create `.github/workflows/test.yml`:

```yaml
name: Tests

on: [push, pull_request]

jobs:
  bff-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '20'
      
      - name: Install dependencies
        run: |
          cd be/bff
          npm ci
      
      - name: Run unit tests
        run: |
          cd be/bff
          npm run test:unit
      
      - name: Run integration tests
        run: |
          cd be/bff
          npm run test:integration
      
      - name: Generate coverage
        run: |
          cd be/bff
          npm run test:coverage
      
      - name: Upload coverage
        uses: codecov/codecov-action@v3
        with:
          files: ./be/bff/coverage/lcov.info

  ui-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '20'
      
      - name: Install dependencies
        run: |
          cd ui
          npm ci
      
      - name: Install Playwright
        run: |
          cd ui
          npx playwright install --with-deps
      
      - name: Run E2E tests
        run: |
          cd ui
          npm test
      
      - name: Upload test report
        if: always()
        uses: actions/upload-artifact@v3
        with:
          name: playwright-report
          path: ui/playwright-report/
```

### Pre-commit Hooks

Install Husky:

```bash
npm install --save-dev husky
npx husky install
```

Add pre-commit hook:

```bash
npx husky add .husky/pre-commit "cd be/bff && npm run test:unit"
```

---

## Best Practices

### General

1. **Keep tests independent**
   - Each test should run standalone
   - Don't rely on test execution order
   - Clean up after tests

2. **Use descriptive names**
   ```javascript
   // Bad
   it('works', () => {});
   
   // Good
   it('should return 400 when location is missing', () => {});
   ```

3. **Test one thing at a time**
   ```javascript
   // Bad
   it('should login and create profile and send message', () => {});
   
   // Good
   it('should login with valid credentials', () => {});
   it('should create profile with birth details', () => {});
   it('should send chat message', () => {});
   ```

4. **Use setup/teardown**
   ```javascript
   beforeEach(async () => {
     // Setup
   });
   
   afterEach(async () => {
     // Cleanup
   });
   ```

### Unit Tests

1. **Mock external dependencies**
   ```javascript
   jest.mock('axios');
   ```

2. **Test edge cases**
   - Empty inputs
   - Null/undefined
   - Invalid data types
   - Boundary values

3. **Test error paths**
   ```javascript
   await expect(fn()).rejects.toThrow('Expected error');
   ```

### Integration Tests

1. **Use real server instance**
   - Test actual HTTP requests
   - Verify headers
   - Check status codes

2. **Test middleware**
   - Authentication
   - Rate limiting
   - CORS

3. **Test error responses**
   ```javascript
   .expect(400)
   .expect({ error: 'INVALID_INPUT' })
   ```

### E2E Tests

1. **Use stable selectors**
   ```javascript
   // Good: data-testid
   page.locator('[data-testid="login-button"]')
   
   // Avoid: fragile selectors
   page.locator('div > div > button:nth-child(3)')
   ```

2. **Wait for elements**
   ```javascript
   await expect(element).toBeVisible({ timeout: 5000 });
   ```

3. **Take screenshots on failure**
   ```javascript
   test.afterEach(async ({ page }, testInfo) => {
     if (testInfo.status !== 'passed') {
       await page.screenshot({ path: `failure-${testInfo.title}.png` });
     }
   });
   ```

### Load Tests

1. **Start with realistic scenarios**
   - Model actual user behavior
   - Use production-like data

2. **Gradually increase load**
   - Don't start at peak
   - Allow warm-up time

3. **Monitor server metrics**
   - CPU usage
   - Memory usage
   - Response times

---

## Troubleshooting

### Jest Tests Failing

**Problem:** Tests fail with module not found

**Solution:**
```bash
cd be/bff
npm install
```

**Problem:** Tests timeout

**Solution:** Increase timeout in test file
```javascript
jest.setTimeout(30000); // 30 seconds
```

### Playwright Tests Failing

**Problem:** Browser not found

**Solution:**
```bash
cd ui
npx playwright install
```

**Problem:** Element not found

**Solution:** Add explicit waits
```javascript
await page.waitForSelector('[data-testid="element"]', { timeout: 10000 });
```

**Problem:** Tests flaky (pass/fail randomly)

**Solution:** 
- Add proper waits
- Avoid `page.waitForTimeout()` 
- Use `expect().toBeVisible()` instead

### Load Tests Failing

**Problem:** Connection refused

**Solution:** Ensure server is running
```bash
cd be/bff
npm run dev
```

**Problem:** High error rate

**Solution:** Check server logs
```bash
docker-compose logs bff-service
```

---

## Next Steps

1. **Increase coverage**: Add tests for remaining services and routes
2. **Add visual regression testing**: Use Playwright's screenshot comparison
3. **Performance budgets**: Set thresholds in load tests
4. **Mutation testing**: Use tools like Stryker to test your tests
5. **Contract testing**: Use Pact for API contract verification

---

**Happy Testing! 🧪**
