import { Request, Response, NextFunction } from "express";
import { TooManyRequestsError } from "@/utils/errors";
import { logger } from "@/utils/logger";
import { reportRateLimiting } from "@/utils/errorReporting";

// Simple in-memory rate limiting
// For production, consider using Redis or another distributed cache
const ipRequestCounts: Record<string, { count: number; resetTime: number }> =
  {};

interface RateLimitOptions {
  windowMs: number; // Time window in milliseconds
  maxRequests: number; // Maximum requests per window
  message?: string; // Custom error message
  skipSuccessfulRequests?: boolean; // Only count failed requests
  keyGenerator?: (req: Request) => string; // Custom key generator
}

/**
 * Rate limiting middleware
 * For production use, consider using express-rate-limit or similar with Redis store
 */
export function rateLimiter(options: RateLimitOptions) {
  const {
    windowMs = 60 * 1000, // 1 minute default
    maxRequests = 100, // 100 requests per minute default
    message = "Too many requests, please try again later",
    skipSuccessfulRequests = false,
    keyGenerator,
  } = options;

  return (req: Request, res: Response, next: NextFunction): void => {
    const requestId = req.headers["x-request-id"] as string;

    // Generate a key for this request
    const key = keyGenerator
      ? keyGenerator(req)
      : req.user?.uid
      ? `user:${req.user.uid}`
      : `ip:${req.ip}`;

    // Get the current time
    const now = Date.now();

    // Get or initialize the request tracker for this key
    const requestTracker = ipRequestCounts[key] || {
      count: 0,
      resetTime: now + windowMs,
    };

    // Reset if window has expired
    if (now > requestTracker.resetTime) {
      requestTracker.count = 0;
      requestTracker.resetTime = now + windowMs;
    }

    // Check if limit exceeded
    if (requestTracker.count >= maxRequests) {
      // Rate limit exceeded
      const retryAfter = Math.ceil((requestTracker.resetTime - now) / 1000);

      // Set headers
      res.setHeader("Retry-After", retryAfter.toString());
      res.setHeader("X-RateLimit-Limit", maxRequests.toString());
      res.setHeader("X-RateLimit-Remaining", "0");
      res.setHeader(
        "X-RateLimit-Reset",
        Math.ceil(requestTracker.resetTime / 1000).toString()
      );

      // Log and report rate limiting
      logger.warn({
        message: "Rate limit exceeded",
        requestId,
        ip: req.ip,
        userId: req.user?.uid,
        path: req.path,
        method: req.method,
        retryAfter,
      });

      // Report to monitoring - fix the reference with proper null checks
      reportRateLimiting(
        req.user?.uid ?? "unknown",
        req.ip ?? "unknown",
        req.path
      );

      // Return rate limit error
      next(
        new TooManyRequestsError(message, "RATE_LIMIT_EXCEEDED", {
          retryAfter,
          path: req.path,
        })
      );
      return;
    }

    // Increment the request count
    requestTracker.count++;
    ipRequestCounts[key] = requestTracker;

    // Set rate limit headers
    res.setHeader("X-RateLimit-Limit", maxRequests.toString());
    res.setHeader(
      "X-RateLimit-Remaining",
      (maxRequests - requestTracker.count).toString()
    );
    res.setHeader(
      "X-RateLimit-Reset",
      Math.ceil(requestTracker.resetTime / 1000).toString()
    );

    // If we're skipping successful requests, decrement on completed responses
    if (skipSuccessfulRequests) {
      res.on("finish", () => {
        if (res.statusCode < 400 && ipRequestCounts[key]) {
          ipRequestCounts[key].count = Math.max(
            0,
            ipRequestCounts[key].count - 1
          );
        }
      });
    }

    next();
  };
}

/**
 * Standard API rate limiter
 * Limits based on IP or user ID with reasonable defaults
 */
export const standardApiLimiter = rateLimiter({
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 100, // 100 requests per minute
  message: "Too many requests, please try again later",
});

/**
 * Strict rate limiter for sensitive operations
 * More restrictive for auth and admin operations
 */
export const strictApiLimiter = rateLimiter({
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 10, // 10 requests per minute
  message: "Too many sensitive operations, please try again later",
});

/**
 * Auth rate limiter for login/registration
 * Very strict to prevent brute force attacks
 */
export const authLimiter = rateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  maxRequests: 5, // 5 attempts per 15 minutes
  message: "Too many authentication attempts, please try again later",
  // Key based on IP address to prevent multi-account attacks
  keyGenerator: (req: Request) => `auth:${req.ip}`,
});
