module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/__tests__/**/*.test.ts', '**/*.integration.test.ts'],
  testTimeout: 30000,
  forceExit: true,
};
