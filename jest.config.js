/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/__tests__/**/*.test.ts'],
  testPathIgnorePatterns: ['/node_modules/', '<rootDir>/test.js'],
  moduleFileExtensions: ['ts', 'js', 'json'],
  transform: {
    '^.+\\.(ts|tsx)$': ['ts-jest', { isolatedModules: true }],
  },
  verbose: false,
};
