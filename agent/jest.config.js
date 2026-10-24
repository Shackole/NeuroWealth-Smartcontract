module.exports = {
  testEnvironment: 'node',
  transform: { '^.+\\.tsx?$': ['@swc/jest'] },
  testMatch: ['**/*.test.ts', '**/*.integration.test.ts'],
  testTimeout: 30000,
  forceExit: true,
};
