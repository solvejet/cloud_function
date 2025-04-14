/**
 * Custom error classes for the application
 * These errors provide standardized structure for error handling across the application
 */

// Base application error class
export class AppError extends Error {
  public readonly statusCode: number;
  public readonly isOperational: boolean;
  public readonly errorCode: string;
  public readonly context?: Record<string, unknown>;

  constructor(
    message: string,
    statusCode = 500,
    errorCode = "INTERNAL_ERROR",
    isOperational = true,
    context?: Record<string, unknown>
  ) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    this.errorCode = errorCode;
    this.context = context;
    this.name = this.constructor.name;

    // Ensure the correct prototype chain
    Object.setPrototypeOf(this, AppError.prototype);

    // Capture stack trace
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}

// 400 - Bad Request
export class BadRequestError extends AppError {
  constructor(
    message = "Bad request",
    errorCode = "BAD_REQUEST",
    context?: Record<string, unknown>
  ) {
    super(message, 400, errorCode, true, context);
  }
}

// 401 - Unauthorized
export class UnauthorizedError extends AppError {
  constructor(
    message = "Authentication required",
    errorCode = "UNAUTHORIZED",
    context?: Record<string, unknown>
  ) {
    super(message, 401, errorCode, true, context);
  }
}

// 403 - Forbidden
export class ForbiddenError extends AppError {
  constructor(
    message = "Insufficient permissions",
    errorCode = "FORBIDDEN",
    context?: Record<string, unknown>
  ) {
    super(message, 403, errorCode, true, context);
  }
}

// 404 - Not Found
export class NotFoundError extends AppError {
  constructor(
    message = "Resource not found",
    errorCode = "NOT_FOUND",
    context?: Record<string, unknown>
  ) {
    super(message, 404, errorCode, true, context);
  }
}

// 409 - Conflict
export class ConflictError extends AppError {
  constructor(
    message = "Resource conflict",
    errorCode = "CONFLICT",
    context?: Record<string, unknown>
  ) {
    super(message, 409, errorCode, true, context);
  }
}

// 422 - Validation Error
export class ValidationError extends AppError {
  constructor(
    message = "Validation failed",
    errorCode = "VALIDATION_ERROR",
    context?: Record<string, unknown>
  ) {
    super(message, 422, errorCode, true, context);
  }
}

// 429 - Too Many Requests
export class TooManyRequestsError extends AppError {
  constructor(
    message = "Too many requests",
    errorCode = "RATE_LIMIT_EXCEEDED",
    context?: Record<string, unknown>
  ) {
    super(message, 429, errorCode, true, context);
  }
}

// 500 - Internal Server Error
export class InternalServerError extends AppError {
  constructor(
    message = "Internal server error",
    errorCode = "INTERNAL_ERROR",
    context?: Record<string, unknown>
  ) {
    super(message, 500, errorCode, true, context);
  }
}

// Database Error
export class DatabaseError extends AppError {
  constructor(
    message = "Database operation failed",
    errorCode = "DATABASE_ERROR",
    context?: Record<string, unknown>
  ) {
    super(message, 500, errorCode, true, context);
  }
}

// External Service Error
export class ExternalServiceError extends AppError {
  constructor(
    message = "External service error",
    errorCode = "EXTERNAL_SERVICE_ERROR",
    context?: Record<string, unknown>
  ) {
    super(message, 500, errorCode, true, context);
  }
}

// Firebase Auth Error
export class FirebaseAuthError extends AppError {
  constructor(
    message = "Firebase authentication error",
    errorCode = "FIREBASE_AUTH_ERROR",
    context?: Record<string, unknown>
  ) {
    super(message, 500, errorCode, true, context);
  }
}
