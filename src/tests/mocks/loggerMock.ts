// src/tests/mocks/loggerMock.ts
/**
 * Mock implementation of the logger for testing
 */

// Create a mock logger with all the methods we use
const mockLogger = {
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
  http: jest.fn(),
  debug: jest.fn(),
};

// Mock stream for Morgan HTTP logger
const mockMorganStream = {
  write: jest.fn((message: string) => {
    mockLogger.http(message.trim());
  }),
};

export { mockLogger as logger, mockMorganStream as morganStream };
export default mockLogger;
