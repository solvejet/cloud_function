import { Request, Response, NextFunction } from "express";
import {
  Result,
} from "express-validator";
import { AppError, ValidationError } from "@/utils/errors";
import { logger } from "@/utils/logger";

// Define a more comprehensive interface for ValidationErrors
interface ValidatorError {
  param: string;
  msg: string;
  location?: string;
  value?: any;
  [key: string]: any; // Allow for any additional properties
}

// Type guard to check if the error is an array of express-validator errors
function isValidationErrorArray(err: unknown): err is ValidatorError[] {
  return (
    Array.isArray(err) &&
    err.length > 0 &&
    typeof (err[0] as any).param === "string" &&
    typeof (err[0] as any).msg === "string"
  );
}

// Alternative type guard for express-validator's Result object
function isValidationErrorResult(err: unknown): err is Result {
  return (
    typeof err === "object" &&
    err !== null &&
    typeof (err as any).array === "function" &&
    Array.isArray((err as Result).array())
  );
}

/**
 * Global error handler middleware
 * Processes errors and returns appropriate responses
 */
export const errorHandler = (
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction
): void => {
  // Generate a request ID if not already present
  const requestId =
    (req.headers["x-request-id"] as string) ||
    (req.headers["x-correlation-id"] as string) ||
    `req-${Date.now()}-${Math.random().toString(36).substring(2, 10)}`;

  // Default error values
  let statusCode = 500;
  let errorCode = "INTERNAL_SERVER_ERROR";
  let errorMessage = "An unexpected error occurred";
  let context: Record<string, unknown> = {};
  let stack: string | undefined = undefined;

  // Process express-validator validation errors
  if (isValidationErrorArray(err)) {
    statusCode = 422;
    errorCode = "VALIDATION_ERROR";
    errorMessage = "Validation failed";
    context = {
      validation: err.map((e) => ({
        param: e.param,
        msg: e.msg,
        location: e.location,
        value: e.value,
      })),
    };

    // Log validation error
    logger.warn({
      message: "Validation error",
      requestId,
      path: req.path,
      method: req.method,
      validationErrors: context.validation,
      statusCode,
    });
  }
  // Alternative handling for express-validator Result object
  else if (isValidationErrorResult(err)) {
    const validationErrors = err.array();
    statusCode = 422;
    errorCode = "VALIDATION_ERROR";
    errorMessage = "Validation failed";
    context = {
      validation: validationErrors.map((e) => ({
        param: e.type === "field" ? e.path : e.type,
        msg: e.msg,
        location: e.location,
        value: e.type === "field" ? e.value : undefined,
      })),
    };

    // Log validation error
    logger.warn({
      message: "Validation error",
      requestId,
      path: req.path,
      method: req.method,
      validationErrors: context.validation,
      statusCode,
    });
  }
  // Handle our custom AppError instances
  else if (err instanceof AppError) {
    statusCode = err.statusCode;
    errorCode = err.errorCode;
    errorMessage = err.message;
    context = err.context || {};
    stack = err.stack;

    // Log based on error severity
    if (statusCode >= 500) {
      logger.error({
        message: errorMessage,
        requestId,
        path: req.path,
        method: req.method,
        errorCode,
        statusCode,
        stack,
        context,
      });
    } else {
      logger.warn({
        message: errorMessage,
        requestId,
        path: req.path,
        method: req.method,
        errorCode,
        statusCode,
        context,
      });
    }
  }
  // Handle standard Error objects
  else if (err instanceof Error) {
    // For production, don't expose internal error details
    const isProduction = process.env.NODE_ENV === "production";
    errorMessage = isProduction ? "An unexpected error occurred" : err.message;
    stack = err.stack;

    // Log the error with full details
    logger.error({
      message: "Unhandled error",
      requestId,
      path: req.path,
      method: req.method,
      errorMessage: err.message,
      statusCode,
      stack,
    });
  }
  // Handle any other types that might be thrown
  else {
    errorMessage = String(err);

    logger.error({
      message: "Unknown error type thrown",
      requestId,
      path: req.path,
      method: req.method,
      rawError: err,
      statusCode,
    });
  }

  // Send standardized error response
  res.status(statusCode).json({
    error: {
      code: errorCode,
      message: errorMessage,
      ...(Object.keys(context).length > 0 && { details: context }),
      requestId,
    },
  });
};

/**
 * Middleware to handle 404 Not Found errors for undefined routes
 */
export const notFoundHandler = (
  req: Request,
  _res: Response,
  next: NextFunction
): void => {
  next(
    new ValidationError(
      `Route not found: ${req.method} ${req.path}`,
      "ROUTE_NOT_FOUND",
      {
        method: req.method,
        path: req.path,
      }
    )
  );
};
