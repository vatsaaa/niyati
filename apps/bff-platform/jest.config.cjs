module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/test'],
  testMatch: ['**/*.test.js'],
  verbose: true,
  moduleNameMapper: {
    '^@test-helpers$': '<rootDir>/../../packages/commons/test/helpers.js',
  },
  globalTeardown: '<rootDir>/../../packages/commons/jest-teardown.js',
  setupFilesAfterEnv: ['<rootDir>/../../packages/commons/test/setupTests.js']
};
