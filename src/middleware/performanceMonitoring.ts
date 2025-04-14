import { Request, Response, NextFunction } from "express";
import { logger } from "@/utils/logger";
import { reportPerformanceIssue } from "@/utils/errorReporting";

// Performance thresholds in milliseconds
const PERFORMANCE_THRESHOLDS = {
  api: 1000, // 1 second for general API requests
  database: 500, // 500ms for database operations
  authentication: 500, // 500ms for auth operations
  critical: 250, // 250ms for critical operations
};

type OperationType = keyof typeof PERFORMANCE_THRESHOLDS;

/**
 * Middleware to monitor request performance
 */
export function performanceMonitor(operationType: OperationType = "api") {
  const threshold = PERFORMANCE_THRESHOLDS[operationType];

  return (req: Request, res: Response, next: NextFunction): void => {
    const requestId = req.headers["x-request-id"] as string;
    const startTime = Date.now();

    // Once response is finished
    res.on("finish", () => {
      const duration = Date.now() - startTime;

      // Only log slow requests
      if (duration > threshold) {
        logger.warn({
          message: `Slow ${operationType} request`,
          requestId,
          path: req.path,
          method: req.method,
          statusCode: res.statusCode,
          durationMs: duration,
          threshold,
        });

        // Report to monitoring service
        reportPerformanceIssue(
          `${req.method} ${req.path}`,
          duration,
          threshold,
          {
            requestId,
            userId: req.user?.uid,
            statusCode: res.statusCode,
            operationType,
          }
        );
      }
    });

    next();
  };
}

/**
 * Performance monitoring for high-throughput/critical APIs
 * Use this for endpoints that need to be very fast
 */
export const criticalPathMonitor = performanceMonitor("critical");

/**
 * Performance monitoring for database operations
 * Higher time allowance for complex queries
 */
export const databaseOperationMonitor = performanceMonitor("database");

/**
 * Performance monitoring for authentication operations
 */
export const authOperationMonitor = performanceMonitor("authentication");

/**
 * Utility to measure and report function execution time
 */
export async function measurePerformance<T>(
  operation: string,
  fn: () => Promise<T>,
  threshold = PERFORMANCE_THRESHOLDS.api,
  context: Record<string, unknown> = {}
): Promise<T> {
  const startTime = Date.now();

  try {
    return await fn();
  } finally {
    const duration = Date.now() - startTime;

    if (duration > threshold) {
      // Log slow operation
      logger.warn({
        message: `Slow operation: ${operation}`,
        durationMs: duration,
        threshold,
        context,
      });

      // Report to monitoring
      reportPerformanceIssue(operation, duration, threshold, context);
    }
  }
}
