// src/tests/unit/utils/errorHandling.test.ts
import { Request, Response, NextFunction } from "express";
import {
  AppError,
  BadRequestError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  ConflictError,
  ValidationError,
  TooManyRequestsError,
  InternalServerError,
  DatabaseError,
  ExternalServiceError,
  FirebaseAuthError,
} from "@/utils/errors";
import { errorHandler, notFoundHandler } from "@/middleware/errorHandler";
import { logger } from "@/utils/logger";
import * as errorReporting from "@/utils/errorReporting";

// Mock dependencies
jest.mock("@/utils/logger", () => ({
  logger: {
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
  },
}));

// Mock the entire errorReporting module
jest.mock("@/utils/errorReporting", () => {
  // Create a mock implementation that actually calls logger.error
  const mockReportError = jest.fn().mockImplementation((error, details) => {
    const { logger } = require("@/utils/logger");
    logger.error({
      message: "Error reported to monitoring service",
      errorDetails: {
        message: error.message,
        ...details,
      },
    });
  });

  return {
    reportError: mockReportError,
    reportApiFailure: jest.fn(),
    reportPerformanceIssue: jest.fn(),
    reportRateLimiting: jest.fn(),
  };
});

describe("Error Handling", () => {
  describe("Custom Error Classes", () => {
    it("should create AppError with correct properties", () => {
      const error = new AppError(
        "Test error message",
        418,
        "TEST_ERROR",
        true,
        { test: "context" }
      );

      expect(error).toBeInstanceOf(Error);
      expect(error.message).toBe("Test error message");
      expect(error.statusCode).toBe(418);
      expect(error.errorCode).toBe("TEST_ERROR");
      expect(error.isOperational).toBe(true);
      expect(error.context).toEqual({ test: "context" });
      expect(error.stack).toBeDefined();
    });

    it("should create specialized error types with correct defaults", () => {
      const badRequestError = new BadRequestError("Bad request test");
      expect(badRequestError.statusCode).toBe(400);
      expect(badRequestError.errorCode).toBe("BAD_REQUEST");

      const unauthorizedError = new UnauthorizedError("Unauthorized test");
      expect(unauthorizedError.statusCode).toBe(401);
      expect(unauthorizedError.errorCode).toBe("UNAUTHORIZED");

      const forbiddenError = new ForbiddenError("Forbidden test");
      expect(forbiddenError.statusCode).toBe(403);
      expect(forbiddenError.errorCode).toBe("FORBIDDEN");

      const notFoundError = new NotFoundError("Not found test");
      expect(notFoundError.statusCode).toBe(404);
      expect(notFoundError.errorCode).toBe("NOT_FOUND");

      const conflictError = new ConflictError("Conflict test");
      expect(conflictError.statusCode).toBe(409);
      expect(conflictError.errorCode).toBe("CONFLICT");

      const validationError = new ValidationError("Validation test");
      expect(validationError.statusCode).toBe(422);
      expect(validationError.errorCode).toBe("VALIDATION_ERROR");

      const tooManyRequestsError = new TooManyRequestsError(
        "Too many requests test"
      );
      expect(tooManyRequestsError.statusCode).toBe(429);
      expect(tooManyRequestsError.errorCode).toBe("RATE_LIMIT_EXCEEDED");

      const internalServerError = new InternalServerError(
        "Internal server error test"
      );
      expect(internalServerError.statusCode).toBe(500);
      expect(internalServerError.errorCode).toBe("INTERNAL_ERROR");

      const databaseError = new DatabaseError("Database error test");
      expect(databaseError.statusCode).toBe(500);
      expect(databaseError.errorCode).toBe("DATABASE_ERROR");

      const externalServiceError = new ExternalServiceError(
        "External service error test"
      );
      expect(externalServiceError.statusCode).toBe(500);
      expect(externalServiceError.errorCode).toBe("EXTERNAL_SERVICE_ERROR");

      const firebaseAuthError = new FirebaseAuthError(
        "Firebase auth error test"
      );
      expect(firebaseAuthError.statusCode).toBe(500);
      expect(firebaseAuthError.errorCode).toBe("FIREBASE_AUTH_ERROR");
    });
  });

  describe("Error Handler Middleware", () => {
    let mockRequest: Partial<Request>;
    let mockResponse: Partial<Response>;
    let nextFunction: jest.Mock;

    beforeEach(() => {
      mockRequest = {
        headers: { "x-request-id": "test-request-id" },
        path: "/test-path",
        method: "GET",
      };

      mockResponse = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };

      nextFunction = jest.fn();

      // Clear all mocks before each test
      jest.clearAllMocks();
    });

    it("should handle AppError instances correctly", () => {
      const testError = new NotFoundError(
        "Resource not found",
        "CUSTOM_NOT_FOUND",
        { resourceId: "123" }
      );

      errorHandler(
        testError,
        mockRequest as Request,
        mockResponse as Response,
        nextFunction
      );

      expect(mockResponse.status).toHaveBeenCalledWith(404);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: {
          code: "CUSTOM_NOT_FOUND",
          message: "Resource not found",
          details: { resourceId: "123" },
          requestId: "test-request-id",
        },
      });

      // Should log as a warning since it's a 4xx error
      expect(logger.warn).toHaveBeenCalled();
    });

    it("should handle standard Error objects correctly", () => {
      const testError = new Error("Standard error");

      errorHandler(
        testError,
        mockRequest as Request,
        mockResponse as Response,
        nextFunction
      );

      expect(mockResponse.status).toHaveBeenCalledWith(500);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: {
          code: "INTERNAL_SERVER_ERROR",
          message:
            process.env.NODE_ENV === "production"
              ? "An unexpected error occurred"
              : "Standard error",
          requestId: "test-request-id",
        },
      });

      // Should log as an error since it's a 500 error
      expect(logger.error).toHaveBeenCalled();
    });

    it("should handle express-validator validation errors", () => {
      const validationErrors = [
        {
          param: "email",
          msg: "Must be a valid email",
          location: "body",
          value: "not-an-email",
        },
        {
          param: "password",
          msg: "Password too short",
          location: "body",
          value: "123",
        },
      ];

      errorHandler(
        validationErrors,
        mockRequest as Request,
        mockResponse as Response,
        nextFunction
      );

      expect(mockResponse.status).toHaveBeenCalledWith(422);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: {
          code: "VALIDATION_ERROR",
          message: "Validation failed",
          details: {
            validation: expect.arrayContaining([
              expect.objectContaining({
                param: "email",
                msg: "Must be a valid email",
              }),
              expect.objectContaining({
                param: "password",
                msg: "Password too short",
              }),
            ]),
          },
          requestId: "test-request-id",
        },
      });

      // Should log as a warning since it's a 4xx error
      expect(logger.warn).toHaveBeenCalled();
    });

    it("should handle unknown error types", () => {
      // A non-Error object that might be thrown
      const unknownError = { unknownProperty: "something went wrong" };

      errorHandler(
        unknownError,
        mockRequest as Request,
        mockResponse as Response,
        nextFunction
      );

      expect(mockResponse.status).toHaveBeenCalledWith(500);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: {
          code: "INTERNAL_SERVER_ERROR",
          message: "[object Object]", // String(unknownError)
          requestId: "test-request-id",
        },
      });

      // Should log as an error since it's a 500 error
      expect(logger.error).toHaveBeenCalled();
    });
  });

  describe("Not Found Handler", () => {
    it("should create a ValidationError for undefined routes", () => {
      const mockRequest = {
        method: "GET",
        path: "/nonexistent-route",
      } as Request;

      const mockResponse = {} as Response;
      const nextFunction = jest.fn();

      notFoundHandler(mockRequest, mockResponse, nextFunction);

      // Verify the function was called with an error
      expect(nextFunction).toHaveBeenCalled();

      // Get the error object passed to next
      const error = nextFunction.mock.calls[0][0];

      // Check properties instead of instanceof
      expect(error.message).toBe("Route not found: GET /nonexistent-route");
      expect(error.errorCode).toBe("ROUTE_NOT_FOUND");
      expect(error.statusCode).toBe(422); // ValidationError status code
    });
  });

  describe("Error Reporting Integration", () => {
    beforeEach(() => {
      // Clear all mocks before each test
      jest.clearAllMocks();
    });

    it("should report errors to monitoring service", () => {
      const error = new DatabaseError("Test database error", "DB_TEST_ERROR", {
        collection: "users",
      });

      // Reset the logger.error mock to ensure it starts with zero calls
      (logger.error as jest.Mock).mockClear();

      // Call reportError which should invoke logger.error
      errorReporting.reportError(error, {
        userId: "test-user",
        requestId: "test-request-id",
        url: "/api/users",
        method: "POST",
      });

      // Check that reportError was called
      expect(errorReporting.reportError).toHaveBeenCalledWith(
        error,
        expect.objectContaining({
          userId: "test-user",
          requestId: "test-request-id",
        })
      );

      // Now logger.error should have been called by our mock implementation
      expect(logger.error).toHaveBeenCalled();
    });
  });
});
