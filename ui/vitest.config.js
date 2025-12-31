import { defineConfig } from 'vitest/config'

export default defineConfig({
  define: {
    'process.env.NODE_ENV': '"development"'
  },
  test: {
    environment: 'jsdom',
    setupFiles: './test/setupTests.js',
  },
})
