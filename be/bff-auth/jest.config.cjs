module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/test'],
  testMatch: ['**/*.test.js'],
  verbose: true,
  moduleNameMapper: {
    '^@test-helpers$': '<rootDir>/../commons/test/helpers.js',
  },
};
