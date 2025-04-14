// src/tests/utils/errorTestingUtils.ts
import {
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

/**
 * Utility function to check if an error is of a specific custom error type
 * This works around the instanceof issues when testing with mocked modules
 */
export function isErrorOfType(error: any, errorType: any): boolean {
  if (!error) return false;

  // Check name property (most reliable)
  if (error.name === errorType.name) return true;

  // Check based on status code and error code (fallback)
  if (error.statusCode && error.errorCode) {
    if (errorType === BadRequestError && error.statusCode === 400) return true;
    if (errorType === UnauthorizedError && error.statusCode === 401)
      return true;
    if (errorType === ForbiddenError && error.statusCode === 403) return true;
    if (errorType === NotFoundError && error.statusCode === 404) return true;
    if (errorType === ConflictError && error.statusCode === 409) return true;
    if (errorType === ValidationError && error.statusCode === 422) return true;
    if (errorType === TooManyRequestsError && error.statusCode === 429)
      return true;
    if (
      errorType === InternalServerError &&
      error.statusCode === 500 &&
      error.errorCode === "INTERNAL_ERROR"
    )
      return true;
    if (
      errorType === DatabaseError &&
      error.statusCode === 500 &&
      error.errorCode === "DATABASE_ERROR"
    )
      return true;
    if (
      errorType === ExternalServiceError &&
      error.statusCode === 500 &&
      error.errorCode === "EXTERNAL_SERVICE_ERROR"
    )
      return true;
    if (
      errorType === FirebaseAuthError &&
      error.statusCode === 500 &&
      error.errorCode === "FIREBASE_AUTH_ERROR"
    )
      return true;
  }

  return false;
}

/**
 * Custom Jest matchers for error testing
 * This extends Jest's expect with additional matchers for your custom error types
 */
expect.extend({
  toBeErrorOfType(received: any, expected: any) {
    const pass = isErrorOfType(received, expected);
    if (pass) {
      return {
        message: () =>
          `expected ${received} not to be of error type ${expected.name}`,
        pass: true,
      };
    } else {
      return {
        message: () =>
          `expected ${received} to be of error type ${expected.name}`,
        pass: false,
      };
    }
  },

  /**
   * Custom matcher to check if a promise rejects with a specific error type
   * This is helpful for async tests and avoids the issues with instanceof
   */
  async toRejectWithErrorType(received: Promise<any>, expected: any) {
    let error: unknown;
    let pass = false;

    try {
      await received;
      // If we get here, the promise resolved, which is a failure
      pass = false;
    } catch (e) {
      error = e;
      pass = isErrorOfType(e, expected);
    }

    if (pass) {
      return {
        message: () =>
          `expected promise not to reject with error of type ${expected.name}`,
        pass: true,
      };
    } else {
      return {
        message: () =>
          `expected promise to reject with error of type ${expected.name}\n` +
          `received: ${
            error
              ? `${(error as Error).constructor.name} with message "${(error as Error).message}"`
              : "no error"
          }`,
        pass: false,
      };
    }
  },
});

// Add the custom matcher to the global Jest types
declare global {
  namespace jest {
    interface Matchers<R> {
      toBeErrorOfType(expected: any): R;
      toRejectWithErrorType(expected: any): Promise<R>;
    }

    // Add custom asymmetric matcher for error types
    interface Expect {
      errorOfType(expected: any): any;
    }
  }
}

// Add asymmetric matcher for error types
expect.errorOfType = (expected: any) => ({
  asymmetricMatch: (actual: any) => isErrorOfType(actual, expected),
  toAsymmetricMatcher: () => `ErrorOfType<${expected.name}>`,
});
