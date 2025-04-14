// src/tests/integration/routes/authRoutes.test.ts
import request from "supertest";
import express from "express";
import { auth, db } from "@/config/firebase";
import authRoutes from "@/routes/authRoutes";
import { errorHandler } from "@/middleware/errorHandler";

// Mock Firebase Auth and Firestore
jest.mock("@/config/firebase", () => ({
  auth: jest.fn(() => ({
    getUserByEmail: jest.fn(),
    createCustomToken: jest.fn(),
    revokeRefreshTokens: jest.fn(),
  })),
  db: jest.fn(() => ({
    collection: jest.fn(() => ({
      doc: jest.fn(() => ({
        set: jest.fn().mockResolvedValue({}),
        delete: jest.fn().mockResolvedValue({}),
      })),
      where: jest.fn(() => ({
        limit: jest.fn(() => ({
          get: jest.fn(),
        })),
        orderBy: jest.fn(() => ({
          limit: jest.fn(() => ({
            get: jest.fn(),
          })),
        })),
      })),
    })),
  })),
}));

jest.mock("@/utils/security", () => ({
  calculateLoginThrottle: jest.fn().mockResolvedValue(0),
}));

jest.mock("@/middleware/rateLimiter", () => ({
  authLimiter: jest.fn((req, res, next) => next()),
}));

jest.mock("@/middleware/validation/authValidation", () => ({
  validateLogin: [jest.fn((req, res, next) => next())],
  validateRefreshToken: [jest.fn((req, res, next) => next())],
  validateLogout: [jest.fn((req, res, next) => next())],
}));

describe("Auth Routes Integration Tests", () => {
  let app: express.Application;

  beforeEach(() => {
    // Create a new Express application for each test
    app = express();
    app.use(express.json());
    app.use("/api/auth", authRoutes);
    app.use(errorHandler);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("POST /api/auth/login", () => {
    it("should return 200 and tokens on successful login", async () => {
      // Mock successful user retrieval
      const mockUserRecord = {
        uid: "test-user-id",
        email: "test@example.com",
        disabled: false,
      };
      (auth().getUserByEmail as jest.Mock).mockResolvedValueOnce(
        mockUserRecord
      );

      // Mock successful token creation
      (auth().createCustomToken as jest.Mock).mockResolvedValueOnce(
        "mocked-custom-token"
      );

      // Mock empty refresh token collection (no existing tokens)
      const mockCollection = db().collection("");
      const mockWhere = mockCollection.where("", "", "");
      const mockLimit = mockWhere.limit(1);
      const mockGet = mockLimit.get;
      mockGet.mockResolvedValueOnce({ empty: true, docs: [] });

      const response = await request(app).post("/api/auth/login").send({
        email: "test@example.com",
        password: "password123",
      });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty("accessToken");
      expect(response.body).toHaveProperty("refreshToken");
      expect(response.body).toHaveProperty("userId", "test-user-id");
      expect(response.body.message).toBe("Login successful");
    });

    it("should return 401 when user account is disabled", async () => {
      // Mock disabled user
      const mockUserRecord = {
        uid: "test-user-id",
        email: "test@example.com",
        disabled: true,
      };
      (auth().getUserByEmail as jest.Mock).mockResolvedValueOnce(
        mockUserRecord
      );

      const response = await request(app).post("/api/auth/login").send({
        email: "test@example.com",
        password: "password123",
      });

      expect(response.status).toBe(401);
      expect(response.body.error).toHaveProperty("code", "ACCOUNT_DISABLED");
    });

    it("should return 401 when credentials are invalid", async () => {
      // Mock Firebase auth error
      (auth().getUserByEmail as jest.Mock).mockRejectedValueOnce(
        new Error("Firebase: Auth error")
      );

      const response = await request(app).post("/api/auth/login").send({
        email: "test@example.com",
        password: "password123",
      });

      expect(response.status).toBe(401);
      expect(response.body.error).toHaveProperty("code", "INVALID_CREDENTIALS");
    });

    it("should return 400 when required fields are missing", async () => {
      // Override the mock to actually validate
      const authRoutes = jest.requireActual("@/routes/authRoutes").default;
      const app = express();
      app.use(express.json());

      // Use actual validation middleware
      const { validateLogin } = jest.requireActual(
        "@/middleware/validation/authValidation"
      );
      app.post("/login", validateLogin, (req, res) => res.json({ ok: true }));

      app.use(errorHandler);

      const response = await request(app)
        .post("/login")
        .send({ email: "test@example.com" }); // Missing password

      expect(response.status).toBe(422);
      expect(response.body.error).toHaveProperty("code", "VALIDATION_ERROR");
    });
  });

  describe("POST /api/auth/refresh-token", () => {
    it("should return 200 and new access token on valid refresh token", async () => {
      // Mock successful token retrieval
      const mockTokenDoc = {
        data: jest.fn().mockReturnValue({
          userId: "test-user-id",
          expires: Date.now() + 3600000, // 1 hour in the future
          clientIp: "127.0.0.1",
        }),
        ref: {
          update: jest.fn().mockResolvedValue({}),
        },
      };

      const mockCollection = db().collection("");
      const mockWhere = mockCollection.where("", "", "");
      const mockLimit = mockWhere.limit(1);
      const mockGet = mockLimit.get;
      mockGet.mockResolvedValueOnce({
        empty: false,
        docs: [mockTokenDoc],
      });

      // Mock custom token creation
      (auth().createCustomToken as jest.Mock).mockResolvedValueOnce(
        "new-custom-token"
      );

      const response = await request(app).post("/api/auth/refresh-token").send({
        refreshToken: "valid-refresh-token",
      });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty("accessToken", "new-custom-token");
      expect(response.body).toHaveProperty("userId", "test-user-id");
    });

    it("should return 401 when refresh token is invalid", async () => {
      // Mock empty result (token not found)
      const mockCollection = db().collection("");
      const mockWhere = mockCollection.where("", "", "");
      const mockLimit = mockWhere.limit(1);
      const mockGet = mockLimit.get;
      mockGet.mockResolvedValueOnce({ empty: true, docs: [] });

      const response = await request(app).post("/api/auth/refresh-token").send({
        refreshToken: "invalid-refresh-token",
      });

      expect(response.status).toBe(401);
      expect(response.body.error).toHaveProperty(
        "code",
        "INVALID_REFRESH_TOKEN"
      );
    });

    it("should return 401 when refresh token is expired", async () => {
      // Mock expired token
      const mockTokenDoc = {
        data: jest.fn().mockReturnValue({
          userId: "test-user-id",
          expires: Date.now() - 3600000, // 1 hour in the past
          clientIp: "127.0.0.1",
        }),
        ref: {
          delete: jest.fn().mockResolvedValue({}),
        },
      };

      const mockCollection = db().collection("");
      const mockWhere = mockCollection.where("", "", "");
      const mockLimit = mockWhere.limit(1);
      const mockGet = mockLimit.get;
      mockGet.mockResolvedValueOnce({
        empty: false,
        docs: [mockTokenDoc],
      });

      const response = await request(app).post("/api/auth/refresh-token").send({
        refreshToken: "expired-refresh-token",
      });

      expect(response.status).toBe(401);
      expect(response.body.error).toHaveProperty(
        "code",
        "REFRESH_TOKEN_EXPIRED"
      );
      expect(mockTokenDoc.ref.delete).toHaveBeenCalled();
    });
  });

  describe("POST /api/auth/logout", () => {
    it("should return 200 on successful logout", async () => {
      // Mock the request with authenticated user
      const mockRequest = request(app)
        .post("/api/auth/logout")
        .set("Authorization", "Bearer valid-token");

      // Intercept the request to inject user
      const originalEnd = mockRequest.end;
      mockRequest.end = function (fn) {
        // @ts-ignore - Adding user property before verifyToken middleware runs
        this.req.user = { uid: "test-user-id" };
        return originalEnd.call(this, fn);
      };

      // Mock finding token
      const mockTokenDoc = {
        ref: {
          delete: jest.fn().mockResolvedValue({}),
        },
      };

      const mockCollection = db().collection("");
      const mockWhere = mockCollection.where("", "", "");
      const mockOrderBy = mockWhere.orderBy("", "");
      const mockLimit = mockOrderBy.limit(1);
      const mockGet = mockLimit.get;
      mockGet.mockResolvedValueOnce({
        empty: false,
        docs: [mockTokenDoc],
      });

      const response = await mockRequest.send({});

      expect(response.status).toBe(200);
      expect(response.body.message).toBe("Logged out successfully");
      expect(auth().revokeRefreshTokens).toHaveBeenCalledWith("test-user-id");
    });

    it("should return 401 when user is not authenticated", async () => {
      const response = await request(app).post("/api/auth/logout").send({});

      expect(response.status).toBe(401);
    });
  });
});
