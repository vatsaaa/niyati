# BFF Tests

Comprehensive test suite for the Niyati Backend for Frontend (BFF) service.

## Quick Start

```bash
# Install dependencies
npm install

# Run all tests
npm test

# Run with coverage
npm run test:coverage
```

## Test Structure

```
tests/
├── unit/                    # Unit tests for individual functions
│   └── services/
│       ├── geocodeService.test.js
│       └── astrologyService.test.js
├── integration/             # Integration tests for API endpoints
│   ├── geocode.test.js
│   └── telemetry.test.js
├── load/                    # Load and performance tests
│   ├── baseline.yml
│   └── processor.js
└── setup.js                 # Global test configuration
```

## Available Commands

| Command | Description |
|---------|-------------|
| `npm test` | Run all tests |
| `npm run test:unit` | Run only unit tests |
| `npm run test:integration` | Run only integration tests |
| `npm run test:watch` | Run tests in watch mode |
| `npm run test:coverage` | Generate coverage report |
| `npm run test:load` | Run load tests with Artillery |
| `npm run test:all` | Run unit + integration tests |

## Coverage Goals

- **Services:** 80%+
- **Routes:** 90%+
- **Utilities:** 95%+

## Writing Tests

### Unit Test Example

```javascript
const myService = require('../../src/services/myService');

describe('MyService', () => {
  it('should process data correctly', async () => {
    const result = await myService.process({ data: 'test' });
    expect(result).toBeDefined();
  });
});
```

### Integration Test Example

```javascript
const request = require('supertest');
const app = require('../../src/app');

describe('GET /api/v1/endpoint', () => {
  it('should return 200', async () => {
    const response = await request(app)
      .get('/api/v1/endpoint')
      .expect(200);
  });
});
```

## Running Specific Tests

```bash
# Run tests matching pattern
npm test -- geocode

# Run single test file
npm test -- tests/unit/services/geocodeService.test.js

# Run with verbose output
npm test -- --verbose
```

## CI/CD Integration

Tests run automatically on:
- Pull requests
- Pushes to main branch
- Pre-commit hooks (when configured)

See `TESTING.md` in project root for complete documentation.
