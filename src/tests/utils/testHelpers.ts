// src/tests/utils/testHelpers.ts
import { Request, Response } from "express";

/**
 * Creates a mock Express request object
 */
export function createMockRequest(
  overrides: Partial<Request> = {}
): Partial<Request> {
  return {
    headers: {
      authorization: "Bearer test-token",
      "x-request-id": "test-request-id",
      ...overrides.headers,
    },
    body: {},
    params: {},
    query: {},
    path: "/test-path",
    method: "GET",
    ip: "127.0.0.1",
    ...overrides,
  };
}

/**
 * Creates a mock Express response object
 */
export function createMockResponse(): Partial<Response> {
  const res: Partial<Response> = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  res.send = jest.fn().mockReturnValue(res);
  res.setHeader = jest.fn().mockReturnValue(res);
  res.end = jest.fn().mockReturnValue(res);
  return res;
}

/**
 * Creates a mock next function
 */
export function createMockNext(): jest.Mock {
  return jest.fn();
}

/**
 * Verifies if nextFunction was called with an error of the expected type
 */
export function expectNextCalledWithError(
  next: jest.Mock,
  errorType: any,
  statusCode: number,
  errorCode: string
): void {
  expect(next).toHaveBeenCalled();
  const error = next.mock.calls[0][0];

  // Check error properties
  expect(error).toHaveProperty("statusCode", statusCode);
  expect(error).toHaveProperty("errorCode", errorCode);

  // Check error type by name (more reliable than instanceof in mocked environments)
  expect(error.name).toBe(errorType.name);
}

/**
 * Helper to create a mock Firebase user
 */
export function createMockFirebaseUser(overrides = {}) {
  return {
    uid: "test-user-id",
    email: "test@example.com",
    emailVerified: true,
    displayName: "Test User",
    disabled: false,
    metadata: {
      creationTime: "2023-01-01T00:00:00Z",
      lastSignInTime: "2023-01-02T00:00:00Z",
    },
    ...overrides,
  };
}

/**
 * Helper to set up common mocks for Firebase auth
 */
export function setupFirebaseMocks() {
  // Get auth and db from config/firebase
  const { auth, db } = require("@/config/firebase");

  // Set up mock implementations
  const mockAuth = {
    verifyIdToken: jest.fn(),
    createCustomToken: jest.fn(),
    getUserByEmail: jest.fn(),
    getUser: jest.fn(),
    setCustomUserClaims: jest.fn(),
    revokeRefreshTokens: jest.fn(),
  };

  const mockDb = {
    collection: jest.fn().mockReturnThis(),
    doc: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    get: jest.fn(),
    set: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    count: jest.fn().mockReturnValue({
      get: jest.fn().mockResolvedValue({ data: () => ({ count: 0 }) }),
    }),
  };

  // Set the mock implementations
  auth.mockReturnValue(mockAuth);
  db.mockReturnValue(mockDb);

  // Return the mocks for use in tests
  return { mockAuth, mockDb };
}
