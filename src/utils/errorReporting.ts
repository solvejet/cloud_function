import { AppError } from "./errors";
import { logger } from "./logger";

interface ErrorDetails {
  message: string;
  stack?: string;
  code?: string;
  context?: Record<string, unknown>;
  userId?: string;
  requestId?: string;
  url?: string;
  method?: string;
}

/**
 * Error reporting utility for sending errors to external monitoring services
 * Adapt this file to integrate with your preferred error monitoring service
 * (e.g., Sentry, Google Cloud Error Reporting, New Relic, etc.)
 */

// Flag to prevent reporting errors in tests
const isTestEnvironment = process.env.NODE_ENV === "test";

/**
 * Report an error to external error monitoring service
 */
function reportError(
  error: Error | AppError,
  details: Partial<ErrorDetails> = {}
): void {
  // Skip reporting in test environment
  if (isTestEnvironment) {
    return;
  }

  try {
    // Basic error details
    const errorDetails: ErrorDetails = {
      message: error.message,
      stack: error.stack,
      ...details,
    };

    // Add custom fields for AppError instances
    if (error instanceof AppError) {
      errorDetails.code = error.errorCode;
      errorDetails.context = error.context;
    }

    // Log the error locally
    logger.error({
      message: "Error reported to monitoring service",
      errorDetails,
    });

    // Example integration with Google Cloud Error Reporting
    // This is commented out as it requires additional setup
    /*
    const {ErrorReporting} = require('@google-cloud/error-reporting');
    const errors = new ErrorReporting({
      projectId: process.env.GCP_PROJECT_ID,
      reportMode: process.env.NODE_ENV === 'production' ? 'production' : 'always',
    });
    
    errors.report(error.message, {
      user: details.userId,
      ...errorDetails,
    });
    */

    // Example integration with Sentry
    // This is commented out as it requires additional setup
    /*
    const Sentry = require('@sentry/node');
    
    Sentry.configureScope((scope) => {
      if (details.userId) scope.setUser({ id: details.userId });
      if (details.requestId) scope.setTag('requestId', details.requestId);
      if (details.url) scope.setTag('url', details.url);
      if (details.method) scope.setTag('method', details.method);
      
      if (details.context) {
        Object.entries(details.context).forEach(([key, value]) => {
          scope.setExtra(key, value);
        });
      }
    });
    
    Sentry.captureException(error);
    */
  } catch (reportingError) {
    // Ensure error reporting never throws
    logger.error({
      message: "Error in error reporting mechanism",
      error:
        reportingError instanceof Error
          ? reportingError.message
          : String(reportingError),
      originalError: error.message,
    });
  }
}

/**
 * Report an API request failure
 */
function reportApiFailure(
  endpoint: string,
  statusCode: number,
  errorMessage: string,
  context: Record<string, unknown> = {}
): void {
  logger.warn({
    message: `API failure: ${endpoint}`,
    statusCode,
    errorMessage,
    context,
  });

  // Integration with monitoring service would go here
}

/**
 * Report a performance issue
 */
function reportPerformanceIssue(
  operation: string,
  durationMs: number,
  threshold: number,
  context: Record<string, unknown> = {}
): void {
  if (durationMs > threshold) {
    logger.warn({
      message: `Performance issue: ${operation}`,
      durationMs,
      threshold,
      exceeded: durationMs - threshold,
      context,
    });

    // Integration with monitoring service would go here
  }
}

/**
 * Track rate limiting events
 */
function reportRateLimiting(
  userId: string,
  ip: string,
  endpoint: string
): void {
  logger.warn({
    message: "Rate limit exceeded",
    userId,
    ip,
    endpoint,
  });

  // Integration with monitoring service would go here
}

// Export everything in a clean way without redeclarations
export {
  reportError,
  reportApiFailure,
  reportPerformanceIssue,
  reportRateLimiting,
};

// For backward compatibility
export default {
  reportError,
  reportApiFailure,
  reportPerformanceIssue,
  reportRateLimiting,
};
