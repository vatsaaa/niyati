export default {
  define: {
    'process.env.NODE_ENV': '"development"'
  },
  test: {
    environment: 'jsdom',
    setupFiles: './test/setupTests.js',
  },
}
