// jest.setup.js
// This file initializes the test environment for all tests

// Import error testing utilities to make custom matchers available globally
require("./src/tests/utils/errorTestingUtils");

// Properly mock the fs module with all required methods
jest.mock("fs", () => ({
  existsSync: jest.fn().mockReturnValue(true),
  mkdirSync: jest.fn(),
  createWriteStream: jest.fn().mockReturnValue({
    on: jest.fn(),
    write: jest.fn(),
    end: jest.fn(),
    once: jest.fn(),
    emit: jest.fn(),
    removeListener: jest.fn(),
  }),
  stat: jest.fn().mockImplementation((path, callback) => {
    callback(null, {
      isFile: () => true,
      isDirectory: () => false,
      size: 12345,
      mtime: new Date(),
    });
  }),
  unlink: jest.fn(),
  readdir: jest.fn().mockImplementation((path, callback) => {
    callback(null, []);
  }),
  promises: {
    readFile: jest.fn().mockResolvedValue(Buffer.from("mock file content")),
    writeFile: jest.fn().mockResolvedValue(undefined),
    access: jest.fn().mockResolvedValue(undefined),
    mkdir: jest.fn().mockResolvedValue(undefined),
  },
}));

// Mock path module for consistent path resolution across environments
jest.mock("path", () => {
  const originalModule = jest.requireActual("path");
  return {
    ...originalModule,
    join: jest.fn((...args) => args.join("/")),
    dirname: jest.fn((path) => path.split("/").slice(0, -1).join("/")),
  };
});

// Mock winston to avoid file system issues
jest.mock("winston", () => {
  // Create a mock format for winston
  const format = {
    combine: jest.fn().mockReturnThis(),
    timestamp: jest.fn().mockReturnThis(),
    colorize: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
    printf: jest.fn().mockReturnThis(),
  };

  // Create mock transport
  const mockTransport = {
    Console: jest.fn().mockImplementation(() => ({
      on: jest.fn(),
    })),
    File: jest.fn().mockImplementation(() => ({
      on: jest.fn(),
    })),
  };

  // Create a mock logger
  const mockLogger = {
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
    http: jest.fn(),
    debug: jest.fn(),
  };

  // Mock createLogger to return our mockLogger
  return {
    format,
    transports: mockTransport,
    createLogger: jest.fn().mockReturnValue(mockLogger),
    addColors: jest.fn(),
  };
});

// Create a global console spy to catch console errors in tests
global.consoleErrorSpy = jest.spyOn(console, "error").mockImplementation();
global.consoleWarnSpy = jest.spyOn(console, "warn").mockImplementation();

// Set up global tests timeouts
jest.setTimeout(30000); // 30 seconds for all tests

// Clean up after each test
afterEach(() => {
  jest.clearAllMocks();
  if (global.consoleErrorSpy) {
    global.consoleErrorSpy.mockClear();
  }
  if (global.consoleWarnSpy) {
    global.consoleWarnSpy.mockClear();
  }
});
