// jest.config.js
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",

  // Setup file to run before tests
  setupFilesAfterEnv: ["<rootDir>/jest.setup.js"],

  // Module name mapper to handle path aliases (matching tsconfig.json)
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/src/$1",
  },

  // Transform TypeScript files
  transform: {
    "^.+\\.tsx?$": [
      "ts-jest",
      {
        isolatedModules: true,
        tsconfig: "tsconfig.json",
      },
    ],
  },

  // Coverage configuration
  collectCoverageFrom: [
    "src/**/*.{ts,tsx}",
    "!src/tests/**/*",
    "!src/**/*.test.{ts,tsx}",
    "!src/**/index.{ts,tsx}",
  ],

  // Improve test speed by limiting directories to search
  roots: ["<rootDir>/src"],

  // Specify test file patterns
  testMatch: ["**/__tests__/**/*.ts?(x)", "**/?(*.)+(spec|test).ts?(x)"],

  // Display test individual test results with console output
  verbose: true,

  // Make sure we're not leaking memory between tests
  restoreMocks: true,
  clearMocks: true,
  resetMocks: false,

  // For faster tests, disable automocking by default
  automock: false,

  // Handle module paths
  moduleFileExtensions: ["ts", "tsx", "js", "jsx", "json", "node"],

  // Set timeout for tests (more useful for integration tests)
  testTimeout: 10000,

  // Add tsconfig-paths/register to handle path aliases from tsconfig.json
  moduleDirectories: ["node_modules", "src"],

  // Handle path resolution specifically for your project structure
  modulePaths: ["<rootDir>"],
};
