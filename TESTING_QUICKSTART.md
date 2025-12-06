# Testing Quick Start Guide

Get started with testing in 5 minutes!

## 🚀 Quick Setup

### BFF (Backend) Tests

```bash
# 1. Navigate to BFF directory
cd be/bff

# 2. Tests are already configured, just run them!
npm test

# 3. (Optional) See coverage report
npm run test:coverage
open coverage/lcov-report/index.html
```

### UI (Frontend) Tests

```bash
# 1. Navigate to UI directory
cd ui

# 2. Install Playwright browsers (one-time setup)
npx playwright install

# 3. Run E2E tests
npm test

# 4. (Optional) Run in interactive mode
npm run test:ui
```

---

## 📋 What Tests Exist?

### BFF - 27 Test Cases

**Unit Tests:**
- ✅ `geocodeService.test.js` - 7 tests for location geocoding
- ✅ `astrologyService.test.js` - 7 tests for astrology calculations

**Integration Tests:**
- ✅ `geocode.test.js` - 5 tests for geocoding API endpoint
- ✅ `telemetry.test.js` - 8 tests for health/info/logging endpoints

### UI - 30+ Test Cases

**E2E Tests:**
- ✅ Login Flow (3 tests)
- ✅ Profile Creation (3 tests)
- ✅ Chat Flow (5 tests)
- ✅ Complete Astrology Reading (1 test)
- ✅ Responsive Design (2 tests)
- ✅ Error Handling (1 test)

---

## 💡 Common Commands

### BFF

```bash
# Run all tests
npm test

# Run only unit tests
npm run test:unit

# Run only integration tests
npm run test:integration

# Run in watch mode (auto-rerun on changes)
npm run test:watch

# Generate coverage report
npm run test:coverage
```

### UI

```bash
# Run all E2E tests
npm test

# Run with interactive UI
npm run test:ui

# Run in headed mode (see the browser)
npm run test:headed

# Debug step-by-step
npm run test:debug

# View test report
npm run test:report

# Generate test code by recording
npm run test:codegen
```

---

## 🎯 What to Test First?

### Day 1: Verify Setup
```bash
# BFF
cd be/bff && npm test

# UI
cd ui && npx playwright install && npm test
```

### Day 2: Add Coverage
```bash
# See what's covered
cd be/bff && npm run test:coverage

# Look for untested files in coverage report
open coverage/lcov-report/index.html
```

### Day 3: Write New Tests
See `TESTING.md` for examples and best practices.

---

## 📖 Documentation

- **Complete Guide:** `TESTING.md` (comprehensive documentation)
- **BFF Tests:** `be/bff/tests/README.md` (quick reference)
- **UI Tests:** `ui/tests/README.md` (quick reference)
- **Summary:** `TESTING_SUMMARY.md` (what's been implemented)

---

## 🐛 Quick Troubleshooting

**BFF tests fail:**
```bash
cd be/bff && npm install
```

**UI tests fail - browsers not found:**
```bash
cd ui && npx playwright install
```

**UI tests fail - port in use:**
Make sure dev server isn't already running on port 5173

**Tests timeout:**
Check if services are running (BFF needs to be up for integration tests)

---

## ✅ Success Checklist

- [ ] BFF tests run successfully (`cd be/bff && npm test`)
- [ ] UI browsers installed (`cd ui && npx playwright install`)
- [ ] UI tests run successfully (`cd ui && npm test`)
- [ ] Coverage report generated (`cd be/bff && npm run test:coverage`)
- [ ] Understand how to write new tests (see `TESTING.md`)

---

**Ready to start testing! 🎉**

For questions or issues, see the full documentation in `TESTING.md`.
