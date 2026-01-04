module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/test'],
  testMatch: ['**/*.test.js'],
  verbose: true,
  setupFilesAfterEnv: ['<rootDir>/test/setupTests.js']
};
