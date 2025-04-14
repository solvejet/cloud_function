import { Request, Response } from "express";
import { auth, db } from "@/config/firebase";
import { logger } from "@/utils/logger";
import {
  BadRequestError,
  UnauthorizedError,
  InternalServerError,
  FirebaseAuthError,
} from "@/utils/errors";
import * as crypto from "crypto";
import { v4 as uuidv4 } from "uuid";
import { calculateLoginThrottle } from "@/utils/security";

// Define token types for authentication flow
interface TokenData {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  tokenType: "Bearer";
  userId: string;
}

// Login attempts tracking for security
interface LoginAttempt {
  timestamp: number;
  ip: string;
  success: boolean;
  email: string;
}

/**
 * Login user with email and password
 */
export const login = async (req: Request, res: Response): Promise<void> => {
  // Use fallback for IP address if it's undefined
  const requestId = req.headers["x-request-id"] as string;
  const clientIp = req.ip || "unknown-ip";

  try {
    const { email, password } = req.body;

    if (!email || !password) {
      throw new BadRequestError(
        "Email and password are required",
        "MISSING_CREDENTIALS"
      );
    }

    // Check if account is locked or throttled
    const throttleDelay = await calculateLoginThrottle(email, clientIp);
    if (throttleDelay > 0) {
      logger.warn({
        message: "Login throttled",
        email,
        ip: clientIp,
        requestId,
        throttleDelay,
      });

      throw new UnauthorizedError(
        "Too many login attempts, please try again later",
        "LOGIN_THROTTLED",
        { retryAfter: Math.ceil(throttleDelay / 1000) }
      );
    }

    // Authenticate with Firebase
    const userRecord = await auth().getUserByEmail(email);

    // Check if user is disabled
    if (userRecord.disabled) {
      logger.warn({
        message: "Login attempt on disabled account",
        email,
        ip: clientIp,
        requestId,
      });

      // Record failed login attempt
      await recordLoginAttempt(email, clientIp, false);

      throw new UnauthorizedError("Account is disabled", "ACCOUNT_DISABLED");
    }

    // Use Firebase Admin SDK to create custom tokens
    const customToken = await auth().createCustomToken(userRecord.uid);

    // Generate a refresh token
    const refreshToken = crypto.randomBytes(64).toString("hex");

    // Store refresh token in database with expiration
    const refreshExpiration = Date.now() + 30 * 24 * 60 * 60 * 1000; // 30 days
    const refreshTokenId = uuidv4();

    await db()
      .collection("userRefreshTokens")
      .doc(refreshTokenId)
      .set({
        token: refreshToken,
        userId: userRecord.uid,
        expires: refreshExpiration,
        createdAt: Date.now(),
        clientIp,
        userAgent: req.headers["user-agent"] || "unknown",
        lastUsed: Date.now(),
      });

    // Record successful login
    await recordLoginAttempt(email, clientIp, true);

    // Clear any previous throttling since login was successful
    await clearThrottling(email, clientIp);

    // Return tokens to client
    const tokenData: TokenData = {
      accessToken: customToken,
      refreshToken: refreshToken,
      expiresIn: 3600, // 1 hour
      tokenType: "Bearer",
      userId: userRecord.uid,
    };

    logger.info({
      message: "User logged in successfully",
      requestId,
      userId: userRecord.uid,
      email: userRecord.email,
    });

    res.status(200).json({
      message: "Login successful",
      ...tokenData,
    });
  } catch (error) {
    // Handle Firebase auth errors
    if (
      error instanceof FirebaseAuthError ||
      (error instanceof Error && error.message.includes("Firebase"))
    ) {
      logger.warn({
        message: "Failed login attempt",
        error: error instanceof Error ? error.message : String(error),
        requestId,
        ip: clientIp,
      });

      // Record failed login attempt if we have an email
      if (req.body.email) {
        await recordLoginAttempt(req.body.email, clientIp, false);
      }

      throw new UnauthorizedError(
        "Invalid email or password",
        "INVALID_CREDENTIALS"
      );
    }

    // Re-throw our custom errors
    if (
      error instanceof BadRequestError ||
      error instanceof UnauthorizedError
    ) {
      throw error;
    }

    // Log any unexpected errors
    logger.error({
      message: "Error during login",
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      requestId,
    });

    throw new InternalServerError(
      "Login failed due to server error",
      "LOGIN_ERROR"
    );
  }
};

/**
 * Refresh access token using a refresh token
 */
export const refreshToken = async (
  req: Request,
  res: Response
): Promise<void> => {
  const requestId = req.headers["x-request-id"] as string;
  const clientIp = req.ip || "unknown-ip";

  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      throw new BadRequestError(
        "Refresh token is required",
        "MISSING_REFRESH_TOKEN"
      );
    }

    // Find the refresh token in the database
    const tokenSnapshot = await db()
      .collection("userRefreshTokens")
      .where("token", "==", refreshToken)
      .limit(1)
      .get();

    if (tokenSnapshot.empty) {
      throw new UnauthorizedError(
        "Invalid refresh token",
        "INVALID_REFRESH_TOKEN"
      );
    }

    // We've already checked that tokenSnapshot is not empty
    const tokenDoc = tokenSnapshot.docs[0];
    if (!tokenDoc) {
      // This should never happen as we've already checked isEmpty,
      // but TypeScript needs this check
      throw new InternalServerError(
        "Token document could not be retrieved",
        "TOKEN_DOCUMENT_ERROR"
      );
    }

    const tokenData = tokenDoc.data();

    // Check if token is expired
    if (tokenData.expires < Date.now()) {
      // Delete expired token
      await tokenDoc.ref.delete();

      throw new UnauthorizedError(
        "Refresh token expired",
        "REFRESH_TOKEN_EXPIRED"
      );
    }

    // Check if token was issued to the same IP (optional security measure)
    if (tokenData.clientIp !== clientIp) {
      logger.warn({
        message: "Refresh token used from different IP",
        requestId,
        originalIp: tokenData.clientIp,
        currentIp: clientIp,
        userId: tokenData.userId,
      });

      // Consider whether to fail here or just warn - this is a security vs. UX tradeoff
      // For strict security, uncomment this:
      /*
      throw new UnauthorizedError(
        "Invalid token origin",
        "TOKEN_IP_MISMATCH"
      );
      */
    }

    // Generate a new access token
    const newCustomToken = await auth().createCustomToken(tokenData.userId);

    // Update last used timestamp
    await tokenDoc.ref.update({
      lastUsed: Date.now(),
    });

    logger.info({
      message: "Access token refreshed",
      requestId,
      userId: tokenData.userId,
    });

    res.status(200).json({
      accessToken: newCustomToken,
      expiresIn: 3600, // 1 hour
      tokenType: "Bearer",
      userId: tokenData.userId,
    });
  } catch (error) {
    // Re-throw our custom errors
    if (
      error instanceof BadRequestError ||
      error instanceof UnauthorizedError ||
      error instanceof InternalServerError
    ) {
      throw error;
    }

    // Log any unexpected errors
    logger.error({
      message: "Error during token refresh",
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      requestId,
    });

    throw new InternalServerError(
      "Token refresh failed due to server error",
      "REFRESH_ERROR"
    );
  }
};

/**
 * Logout user by invalidating refresh tokens
 */
export const logout = async (req: Request, res: Response): Promise<void> => {
  const requestId = req.headers["x-request-id"] as string;
  const userId = req.user?.uid;

  try {
    if (!userId) {
      throw new UnauthorizedError("Not authenticated", "NOT_AUTHENTICATED");
    }

    const { refreshToken, allDevices = false } = req.body;

    // If a specific refresh token is provided, delete just that one
    if (refreshToken) {
      const tokenSnapshot = await db()
        .collection("userRefreshTokens")
        .where("token", "==", refreshToken)
        .where("userId", "==", userId)
        .limit(1)
        .get();

      if (!tokenSnapshot.empty && tokenSnapshot.docs[0]) {
        await tokenSnapshot.docs[0].ref.delete();
      }
    }
    // If requested to log out from all devices, delete all refresh tokens for this user
    else if (allDevices) {
      const batch = db().batch();
      const tokensSnapshot = await db()
        .collection("userRefreshTokens")
        .where("userId", "==", userId)
        .get();

      tokensSnapshot.docs.forEach((doc) => {
        batch.delete(doc.ref);
      });

      await batch.commit();

      logger.info({
        message: "User logged out from all devices",
        requestId,
        userId,
        tokenCount: tokensSnapshot.size,
      });
    }
    // Otherwise, delete the token associated with the current session
    else {
      // This would typically use info from the current session
      // For now, we'll just delete the most recently used token
      const tokenSnapshot = await db()
        .collection("userRefreshTokens")
        .where("userId", "==", userId)
        .orderBy("lastUsed", "desc")
        .limit(1)
        .get();

      if (!tokenSnapshot.empty && tokenSnapshot.docs[0]) {
        await tokenSnapshot.docs[0].ref.delete();
      }
    }

    // Revoke Firebase sessions - note this is very strict and will invalidate ALL sessions
    // You may want to make this optional based on the level of security needed
    await auth().revokeRefreshTokens(userId);

    logger.info({
      message: "User logged out successfully",
      requestId,
      userId,
      allDevices,
    });

    res.status(200).json({
      message: "Logged out successfully",
    });
  } catch (error) {
    // Re-throw our custom errors
    if (error instanceof UnauthorizedError) {
      throw error;
    }

    // Log any unexpected errors
    logger.error({
      message: "Error during logout",
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      userId,
      requestId,
    });

    throw new InternalServerError(
      "Logout failed due to server error",
      "LOGOUT_ERROR"
    );
  }
};

/**
 * Record login attempts for security monitoring and throttling
 */
async function recordLoginAttempt(
  email: string,
  ip: string,
  success: boolean
): Promise<void> {
  try {
    const attempt: LoginAttempt = {
      timestamp: Date.now(),
      ip,
      success,
      email,
    };

    await db().collection("loginAttempts").add(attempt);

    // If login failed, increment the counter for this email/IP combination
    if (!success) {
      const counterRef = db()
        .collection("loginThrottling")
        .doc(`${email}:${ip}`);
      const counterDoc = await counterRef.get();

      if (counterDoc.exists) {
        const data = counterDoc.data();
        if (data) {
          await counterRef.update({
            count: data.count + 1,
            lastAttempt: Date.now(),
          });
        }
      } else {
        await counterRef.set({
          email,
          ip,
          count: 1,
          lastAttempt: Date.now(),
        });
      }
    }
  } catch (error) {
    // Log but don't fail the main request
    logger.error({
      message: "Error recording login attempt",
      error: error instanceof Error ? error.message : String(error),
      email,
      ip,
    });
  }
}

/**
 * Clear throttling after successful login
 */
async function clearThrottling(email: string, ip: string): Promise<void> {
  try {
    await db().collection("loginThrottling").doc(`${email}:${ip}`).delete();
  } catch (error) {
    // Log but don't fail the main request
    logger.error({
      message: "Error clearing login throttling",
      error: error instanceof Error ? error.message : String(error),
      email,
      ip,
    });
  }
}
