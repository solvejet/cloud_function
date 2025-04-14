import { db } from "@/config/firebase";
import { logger } from "./logger";
import * as crypto from "crypto";

/**
 * Security utilities for authentication and authorization
 */

// Maximum number of failed login attempts before throttling
const MAX_FAILED_ATTEMPTS = 5;

// Base delay in milliseconds for exponential backoff
const BASE_DELAY_MS = 1000;

// Maximum delay cap in milliseconds (10 minutes)
const MAX_DELAY_MS = 10 * 60 * 1000;

// Window in milliseconds for counting failed attempts (1 hour)
const ATTEMPT_WINDOW_MS = 60 * 60 * 1000;

/**
 * Calculate login throttle delay based on failed attempts
 * Implements exponential backoff to prevent brute force attacks
 */
export async function calculateLoginThrottle(
  email: string,
  ip: string
): Promise<number> {
  try {
    const throttlingRef = db()
      .collection("loginThrottling")
      .doc(`${email}:${ip}`);
    const throttlingDoc = await throttlingRef.get();

    if (!throttlingDoc.exists) {
      return 0; // No throttling needed
    }

    const data = throttlingDoc.data();

    if (!data) {
      return 0;
    }

    // Check if the last attempt was outside our window
    const timeSinceLastAttempt = Date.now() - data.lastAttempt;
    if (timeSinceLastAttempt > ATTEMPT_WINDOW_MS) {
      // Reset throttling if outside window
      await throttlingRef.delete();
      return 0;
    }

    // If under the threshold, no throttling needed
    if (data.count < MAX_FAILED_ATTEMPTS) {
      return 0;
    }

    // Calculate delay with exponential backoff
    // Formula: min(BASE_DELAY * 2^(count - MAX_FAILED_ATTEMPTS), MAX_DELAY)
    const exponent = Math.min(data.count - MAX_FAILED_ATTEMPTS, 10); // Cap exponent to avoid overflow
    const delay = Math.min(BASE_DELAY_MS * Math.pow(2, exponent), MAX_DELAY_MS);

    logger.warn({
      message: "Login throttling applied",
      email,
      ip,
      failedAttempts: data.count,
      delayMs: delay,
    });

    return delay;
  } catch (error) {
    // Log error but don't block the request in case of DB errors
    // Default to a medium throttle in case of errors to be safe
    logger.error({
      message: "Error calculating login throttle",
      error: error instanceof Error ? error.message : String(error),
      email,
      ip,
    });

    return BASE_DELAY_MS * 8; // Default moderate throttle
  }
}

/**
 * Generate a cryptographically secure token
 */
export function generateSecureToken(length = 32): string {
  return crypto.randomBytes(length).toString("hex");
}

/**
 * Create a secure hash of a value (for storing passwords, etc.)
 */
export async function hashValue(
  value: string,
  salt?: string
): Promise<{ hash: string; salt: string }> {
  // Generate a salt if one isn't provided
  const useSalt = salt || crypto.randomBytes(16).toString("hex");

  return new Promise((resolve, reject) => {
    crypto.pbkdf2(
      value,
      useSalt,
      10000, // iterations - higher is more secure but slower
      64, // key length
      "sha512",
      (err, derivedKey) => {
        if (err) {
          reject(err);
          return;
        }

        resolve({
          hash: derivedKey.toString("hex"),
          salt: useSalt,
        });
      }
    );
  });
}

/**
 * Verify a value against a hash
 */
export async function verifyHash(
  value: string,
  hash: string,
  salt: string
): Promise<boolean> {
  try {
    const result = await hashValue(value, salt);
    return result.hash === hash;
  } catch (error) {
    logger.error({
      message: "Error verifying hash",
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}

/**
 * Clean up expired sessions and tokens
 * (This would typically be run on a schedule)
 */
export async function cleanupExpiredTokens(): Promise<void> {
  try {
    const now = Date.now();
    const batch = db().batch();
    let count = 0;

    // Find expired refresh tokens
    const expiredTokens = await db()
      .collection("userRefreshTokens")
      .where("expires", "<", now)
      .get();

    // Delete expired tokens
    expiredTokens.forEach((doc) => {
      batch.delete(doc.ref);
      count++;
    });

    await batch.commit();

    logger.info({
      message: "Cleaned up expired tokens",
      count,
    });
  } catch (error) {
    logger.error({
      message: "Error cleaning up expired tokens",
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
  }
}

/**
 * Create a time-constant comparison function to prevent timing attacks
 * for comparing security-critical strings like tokens
 */
export function secureCompare(a: string, b: string): boolean {
  // Use crypto's timingSafeEqual for constant-time comparison
  try {
    // Convert strings to buffers of same length
    const bufA = Buffer.from(a);
    const bufB = Buffer.from(b);

    // If lengths differ, create new buffers of same length
    // This prevents leaking length information via timing
    if (bufA.length !== bufB.length) {
      const maxLength = Math.max(bufA.length, bufB.length);
      const paddedA = Buffer.alloc(maxLength, 0);
      const paddedB = Buffer.alloc(maxLength, 0);

      bufA.copy(paddedA);
      bufB.copy(paddedB);

      return crypto.timingSafeEqual(paddedA, paddedB) && a.length === b.length;
    }

    return crypto.timingSafeEqual(bufA, bufB);
  } catch (error) {
    logger.error({
      message: "Error in secure comparison",
      error: error instanceof Error ? error.message : String(error),
    });

    // Default to non-constant time comparison in case of error
    // This is less secure but better than failing completely
    return a === b;
  }
}
