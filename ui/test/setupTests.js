// Ensure tests run with a non-production React build so `act` is available.
if (typeof process === 'undefined') {
  globalThis.process = { env: { NODE_ENV: 'test' } }
} else {
  process.env.NODE_ENV = 'test'
}

import { expect } from 'vitest'
import * as matchers from '@testing-library/jest-dom/matchers'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

// Register jest-dom matchers with Vitest's expect
expect.extend(matchers)

// Minimal test setup: React 18.3.1 provides `act` and Testing Library
// integrates with it. Run cleanup after each test to reset jsdom state.
afterEach(() => {
  cleanup()
})
// a try/catch to avoid errors if the property exists but is non-configurable.
