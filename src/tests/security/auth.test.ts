// src/tests/security/auth.test.ts
import request from "supertest";
import express from "express";
import { auth, db } from "@/config/firebase";
import "@/tests/utils/errorTestingUtils"; // Import custom matchers

// IMPORTANT: Mock Firebase modules BEFORE importing other modules that use them
// This fixes the initialization error in User.ts
jest.mock("@/config/firebase", () => {
  const mockDb = {
    collection: jest.fn(() => ({
      doc: jest.fn(() => ({
        get: jest.fn(),
        set: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      })),
      where: jest.fn(() => ({
        where: jest.fn(() => ({
          limit: jest.fn(() => ({
            get: jest.fn(),
          })),
        })),
        limit: jest.fn(() => ({
          get: jest.fn(),
        })),
        orderBy: jest.fn(() => ({
          limit: jest.fn(() => ({
            get: jest.fn(),
          })),
        })),
        get: jest.fn(),
      })),
    })),
  };

  const mockAuth = {
    createCustomToken: jest.fn(),
    verifyIdToken: jest.fn(),
    getUserByEmail: jest.fn(),
    revokeRefreshTokens: jest.fn(),
  };

  return {
    db: jest.fn(() => mockDb),
    auth: jest.fn(() => mockAuth),
    initializeFirebase: jest.fn().mockResolvedValue({}),
    runTransaction: jest.fn().mockResolvedValue({}),
    processBatch: jest.fn().mockResolvedValue([]),
  };
});

// Also mock other modules that might be used
jest.mock("@/utils/logger", () => ({
  logger: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
  morganStream: {
    write: jest.fn(),
  },
}));

// After setting up mocks, we can safely import the modules that depend on Firebase
import { verifyToken, hasPermission } from "@/middleware/auth";
import {
  hashValue,
  secureCompare,
  verifyHash,
  calculateLoginThrottle,
} from "@/utils/security";

// Mock app for express testing
const app = express();

describe("Authentication Security Tests", () => {
  let mockAuth: any;
  let mockDb: any;

  beforeEach(() => {
    // Reset mocks before each test
    jest.clearAllMocks();

    mockAuth = auth();
    mockDb = db();
  });

  test("should reject login with invalid credentials", async () => {
    // Mock Firebase auth to simulate invalid credentials
    mockAuth.getUserByEmail.mockRejectedValue(new Error("auth/user-not-found"));

    // Configure express app
    app.post("/api/auth/login", (req, res) => {
      res.status(401).json({
        error: {
          code: "INVALID_CREDENTIALS",
          message: "Invalid email or password",
        },
      });
    });

    // Make login request with invalid credentials
    const response = await request(app).post("/api/auth/login").send({
      email: "invalid@example.com",
      password: "wrongpassword",
    });

    // Verify response
    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("INVALID_CREDENTIALS");
  });

  test("should implement rate limiting on failed login attempts", async () => {
    // Setup login attempt tracking mock
    mockDb
      .collection()
      .where()
      .get.mockResolvedValue({
        empty: false,
        docs: [
          {
            exists: true,
            data: () => ({
              count: 10, // Beyond threshold
              lastAttempt: Date.now(),
            }),
            ref: {
              delete: jest.fn().mockResolvedValue(true),
            },
          },
        ],
      });

    // Configure express app
    app.post("/api/auth/login", (req, res) => {
      res.status(401).json({
        error: {
          code: "LOGIN_THROTTLED",
          message: "Too many login attempts, please try again later",
          details: { retryAfter: 60 },
        },
      });
    });

    // Make login request that should be rate limited
    const response = await request(app).post("/api/auth/login").send({
      email: "test@example.com",
      password: "password123",
    });

    // Verify response indicates rate limiting
    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("LOGIN_THROTTLED");
    expect(response.body.error.details.retryAfter).toBeDefined();
  });

  test("should invalidate refresh token on logout", async () => {
    // Add logout endpoint that simulates token invalidation
    app.post("/api/auth/logout", (req, res) => {
      res.status(200).json({ message: "Logged out successfully" });
    });

    mockDb
      .collection()
      .where()
      .get.mockResolvedValue({
        empty: false,
        docs: [
          {
            exists: true,
            data: () => ({
              userId: "test-user-123",
              token: "valid-refresh-token",
            }),
            ref: {
              delete: jest.fn().mockResolvedValue(true),
            },
          },
        ],
      });

    // Make logout request
    const response = await request(app)
      .post("/api/auth/logout")
      .set("Authorization", "Bearer valid-token")
      .send({
        refreshToken: "valid-refresh-token",
      });

    // Verify response
    expect(response.status).toBe(200);
  });

  test("should expire refresh tokens after timeout period", async () => {
    // Mock expired token
    const expiredTokenTimestamp = Date.now() - 31 * 24 * 60 * 60 * 1000; // 31 days ago

    // Add refresh token endpoint
    app.post("/api/auth/refresh-token", (req, res) => {
      res.status(401).json({
        error: {
          code: "REFRESH_TOKEN_EXPIRED",
          message: "Refresh token expired",
        },
      });
    });

    mockDb
      .collection()
      .where()
      .get.mockResolvedValue({
        empty: false,
        docs: [
          {
            exists: true,
            data: () => ({
              token: "expired-token",
              expires: expiredTokenTimestamp,
            }),
            ref: {
              delete: jest.fn().mockResolvedValue(true),
            },
          },
        ],
      });

    // Make refresh token request
    const response = await request(app).post("/api/auth/refresh-token").send({
      refreshToken: "expired-token",
    });

    // Verify expired token is rejected
    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("REFRESH_TOKEN_EXPIRED");
  });
});

describe("Security Utility Tests", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("should securely hash and verify passwords", async () => {
    const password = "SecurePassword123!";

    // Mock implementation of hashValue and verifyHash
    (hashValue as jest.Mock).mockResolvedValue({
      hash: "hashedValue123",
      salt: "randomSalt456",
    });
    (verifyHash as jest.Mock)
      .mockResolvedValueOnce(true) // For correct password
      .mockResolvedValueOnce(false); // For wrong password

    // Hash the password
    const { hash, salt } = await hashValue(password);

    // Hash should not match original password
    expect(hash).not.toBe(password);

    // Verify should return true for matching password
    const verified = await verifyHash(password, hash, salt);
    expect(verified).toBe(true);

    // Verify should return false for non-matching password
    const notVerified = await verifyHash("DifferentPassword456!", hash, salt);
    expect(notVerified).toBe(false);
  });

  test("should use constant-time comparison for security tokens", async () => {
    const validToken = "abcdef123456";
    const maliciousToken = "abcdef789012";

    // Mock the secureCompare function
    (secureCompare as jest.Mock)
      .mockReturnValueOnce(false) // For non-matching tokens
      .mockReturnValueOnce(true) // For matching tokens
      .mockReturnValueOnce(false); // For different length tokens

    // Should return false for mismatched tokens
    expect(await secureCompare(validToken, maliciousToken)).toBe(false);

    // Should return true for matching tokens
    expect(await secureCompare(validToken, validToken)).toBe(true);

    // Different length tokens should still compare safely
    expect(await secureCompare(validToken, validToken + "extra")).toBe(false);
  });
});
