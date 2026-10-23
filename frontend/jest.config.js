const nextJest = require('next/jest');

const createJestConfig = nextJest({
  dir: './',
});

const customJestConfig = {
  setupFiles: ['<rootDir>/jest.polyfills.js'],
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  testEnvironment: 'jest-environment-jsdom',
  testEnvironmentOptions: {
    customExportConditions: [''],
  },
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  collectCoverageFrom: [
    'src/components/DepositForm.tsx',
    'src/components/WithdrawForm.tsx',
    'src/components/StrategySelector.tsx',
    'src/components/PortfolioDashboard.tsx',
    'src/components/TransactionTable.tsx',
    'src/components/NavBar.tsx',
  ],
  coverageThreshold: {
    global: {
      lines: 80,
      functions: 80,
      statements: 80,
    },
  },
};

module.exports = createJestConfig(customJestConfig);
