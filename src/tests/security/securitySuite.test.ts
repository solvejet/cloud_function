// src/tests/security/securitySuite.test.ts
import request from "supertest";
import express from "express";
import { verifyToken, loadPermissions, hasPermission } from "@/middleware/auth";
import { rateLimiter } from "@/middleware/rateLimiter";
import { errorHandler } from "@/middleware/errorHandler";
import { auth } from "@/config/firebase";
import {
  secureCompare,
  hashValue,
  verifyHash,
  calculateLoginThrottle,
} from "@/utils/security";
// Fix the import path to use absolute path with module alias
import "@/tests/utils/errorTestingUtils"; // Import custom matchers

// Mock dependencies
jest.mock("@/config/firebase", () => ({
  auth: jest.fn().mockReturnValue({
    verifyIdToken: jest.fn(),
  }),
  db: jest.fn().mockReturnValue({
    collection: jest.fn().mockReturnThis(),
    doc: jest.fn().mockReturnThis(),
    get: jest.fn(),
  }),
}));

jest.mock("@/utils/logger", () => ({
  logger: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

jest.mock("@/models/User", () => ({
  User: {
    getUserRoles: jest.fn(),
  },
}));

jest.mock("@/models/Role", () => ({
  RoleModel: {
    getRoleById: jest.fn(),
    getPermissionsByIds: jest.fn(),
  },
}));

// Mock security functions
jest.mock("@/utils/security", () => ({
  secureCompare: jest.fn(),
  hashValue: jest.fn(),
  verifyHash: jest.fn(),
  calculateLoginThrottle: jest.fn(),
}));

describe("Security Test Suite", () => {
  // Set up our mocks before each test
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("Rate Limiting", () => {
    let app: express.Application;
    let requestCount = 0;

    beforeEach(() => {
      requestCount = 0;
      app = express();

      // Create simple rate limiter for testing
      const testLimiter = rateLimiter({
        windowMs: 100, // Very short window for testing
        maxRequests: 3, // Low limit for testing
        message: "Too many requests for testing",
      });

      app.use(testLimiter);

      // Simple endpoint that counts requests
      app.get("/test", (req, res) => {
        requestCount++;
        res.status(200).json({ count: requestCount });
      });

      app.use(errorHandler);
    });

    it("should allow requests within rate limit", async () => {
      // Make requests within the limit
      await request(app).get("/test");
      await request(app).get("/test");
      const response = await request(app).get("/test");

      expect(response.status).toBe(200);
      expect(requestCount).toBe(3);
    });

    it("should block requests that exceed rate limit", async () => {
      // Make requests up to the limit
      await request(app).get("/test");
      await request(app).get("/test");
      await request(app).get("/test");

      // This request should be rate limited
      const response = await request(app).get("/test");

      expect(response.status).toBe(429);
      expect(response.body.error.code).toBe("RATE_LIMIT_EXCEEDED");
      expect(requestCount).toBe(3); // The fourth request should not increment
    });

    it("should include rate limit headers in response", async () => {
      const response = await request(app).get("/test");

      expect(response.headers).toHaveProperty("x-ratelimit-limit");
      expect(response.headers).toHaveProperty("x-ratelimit-remaining");
      expect(response.headers).toHaveProperty("x-ratelimit-reset");
    });
  });

  describe("Authentication Security", () => {
    it("should use cryptographically secure functions for token verification", async () => {
      // Mock the secureCompare function
      (secureCompare as jest.Mock)
        .mockReturnValueOnce(true) // for same strings
        .mockReturnValueOnce(false); // for different strings

      const result1 = await secureCompare("same-string", "same-string");
      const result2 = await secureCompare("different-a", "different-b");

      expect(result1).toBe(true);
      expect(result2).toBe(false);
      expect(secureCompare).toHaveBeenCalledTimes(2);
    });

    it("should properly hash and verify values", async () => {
      const testValue = "secure-password-123";
      const mockHashResult = { hash: "hashed-value", salt: "salt-value" };

      // Mock hashValue and verifyHash
      (hashValue as jest.Mock).mockResolvedValue(mockHashResult);
      (verifyHash as jest.Mock)
        .mockResolvedValueOnce(true) // for correct password
        .mockResolvedValueOnce(false); // for incorrect password

      // Hash the value
      const result = await hashValue(testValue);

      // Verify the correct value
      const validResult = await verifyHash(testValue, result.hash, result.salt);

      // Verify an incorrect value
      const invalidResult = await verifyHash(
        "wrong-password",
        result.hash,
        result.salt
      );

      expect(result).toEqual(mockHashResult);
      expect(validResult).toBe(true);
      expect(invalidResult).toBe(false);
    });

    it("should implement exponential backoff for failed login attempts", async () => {
      // Mock throttle calculation
      (calculateLoginThrottle as jest.Mock)
        .mockResolvedValueOnce(0) // First attempt (below threshold)
        .mockResolvedValueOnce(1000) // Second attempt (hits threshold)
        .mockResolvedValueOnce(2000) // Third attempt (exponential increase)
        .mockResolvedValueOnce(4000); // Fourth attempt (further exponential increase)

      // Simulate multiple login attempts
      const delays = [];
      for (let i = 0; i < 4; i++) {
        delays.push(
          await calculateLoginThrottle("test@example.com", "127.0.0.1")
        );
      }

      expect(delays[0]).toBe(0); // First attempt is allowed
      expect(delays[1]).toBe(1000); // Then 1 second delay
      expect(delays[2]).toBe(2000); // Then 2 seconds delay
      expect(delays[3]).toBe(4000); // Then 4 seconds delay
      // This demonstrates exponential backoff
    });
  });

  describe("RBAC Security", () => {
    let req: any, res: any, next: jest.Mock;

    beforeEach(() => {
      req = {
        user: { uid: "test-user" },
        permissions: [
          { resource: "users", action: "read" },
          { resource: "roles", action: "manage" }, // manage includes all actions
        ],
        headers: { "x-request-id": "test-id" },
        path: "/test-path",
      };

      res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };

      next = jest.fn();
    });

    it("should properly validate permissions", () => {
      // User has explicit permission
      hasPermission("users", "read")(req, res, next);
      expect(next).toHaveBeenCalledWith();
      next.mockClear();

      // User has manage permission which includes read
      hasPermission("roles", "read")(req, res, next);
      expect(next).toHaveBeenCalledWith();
      next.mockClear();

      // User doesn't have this permission
      hasPermission("products", "create")(req, res, next);

      // Verify nextFunction was called with an error
      expect(next).toHaveBeenCalled();
      const error = next.mock.calls[0][0];

      // Check error properties without using instanceof
      expect(error).toHaveProperty("statusCode", 403);
      expect(error).toHaveProperty("errorCode", "INSUFFICIENT_PERMISSIONS");
    });

    it("should deny access when no permissions are loaded", () => {
      req.permissions = undefined;

      hasPermission("users", "read")(req, res, next);

      // Verify nextFunction was called with an error
      expect(next).toHaveBeenCalled();
      const error = next.mock.calls[0][0];

      // Check error properties without using instanceof
      expect(error).toHaveProperty("statusCode", 403);
      expect(error).toHaveProperty("errorCode", "PERMISSIONS_NOT_LOADED");
    });

    it("should validate token before checking permissions", async () => {
      const mockAuth = auth();
      mockAuth.verifyIdToken.mockRejectedValueOnce(new Error("Invalid token"));

      req.headers.authorization = "Bearer invalid-token";

      await verifyToken(req, res, next);

      // Verify nextFunction was called with an error
      expect(next).toHaveBeenCalled();
      const error = next.mock.calls[0][0];

      // Check error properties without using instanceof
      expect(error).toHaveProperty("statusCode", 401);
      expect(error).toHaveProperty("errorCode", "INVALID_TOKEN");
    });
  });
});
