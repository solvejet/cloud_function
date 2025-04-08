import request from "supertest";
import { DecodedIdToken } from "firebase-admin/auth";
import * as admin from "firebase-admin";
import { User } from "../../models/User";
import { RoleModel } from "../../models/Role";

// First mock the dependencies before importing the actual modules
jest.mock("firebase-admin", () => ({
  auth: jest.fn().mockReturnValue({
    verifyIdToken: jest.fn(),
    createUser: jest.fn(),
    getUser: jest.fn(),
  }),
  initializeApp: jest.fn(),
}));

jest.mock("../../config/firebase", () => ({
  auth: jest.fn().mockReturnValue({
    verifyIdToken: jest.fn(),
    createUser: jest.fn(),
    getUser: jest.fn(),
  }),
  initializeFirebase: jest.fn(),
  db: jest.fn(),
}));

jest.mock("../../models/User", () => ({
  User: {
    assignRolesToUser: jest.fn(),
    getUserRoles: jest.fn(),
  },
}));

jest.mock("../../models/Role", () => ({
  RoleModel: {
    getRoleById: jest.fn(),
    getPermissionsByIds: jest.fn(),
  },
}));

// Mock the express Router
jest.mock("express", () => {
  const originalExpress = jest.requireActual("express");
  return {
    ...originalExpress,
    Router: jest.fn(() => {
      const router = {
        post: jest.fn().mockReturnThis(),
        get: jest.fn().mockReturnThis(),
        put: jest.fn().mockReturnThis(),
        delete: jest.fn().mockReturnThis(),
        use: jest.fn().mockReturnThis(),
        routes: {},
      };
      return router;
    }),
  };
});

// Create express app for testing
const express = require("express");
const app = express();

// Import controllers and middleware after mocks
import {
  createUser,
  getUserDetails,
  updateUserRoles,
} from "../../controllers/userController";
import {
  verifyToken,
  loadPermissions,
  hasPermission,
} from "../../middleware/auth";
import {
  validateCreateUser,
  validateUpdateUserRoles,
} from "../../middleware/validation/userValidation";

// Set up routes manually to avoid using the actual router
app.use(express.json());
app.post(
  "/api/users",
  (req, res, next) => verifyToken(req, res, next),
  (req, res, next) => loadPermissions(req, res, next),
  (req, res, next) => hasPermission("users", "create")(req, res, next),
  (req, res, next) => createUser(req, res)
);

app.get(
  "/api/users/:id",
  (req, res, next) => verifyToken(req, res, next),
  (req, res, next) => loadPermissions(req, res, next),
  (req, res, next) => {
    // Allow users to get their own details
    if (req.user?.uid === req.params.id) {
      return next();
    }
    // Otherwise, check if they have permission
    return hasPermission("users", "read")(req, res, next);
  },
  (req, res, next) => getUserDetails(req, res)
);

app.put(
  "/api/users/:id/roles",
  (req, res, next) => verifyToken(req, res, next),
  (req, res, next) => loadPermissions(req, res, next),
  (req, res, next) => hasPermission("users", "update")(req, res, next),
  (req, res, next) => updateUserRoles(req, res)
);

describe("User Routes Integration", () => {
  const mockToken = "mock-token";
  const mockAuthService = admin.auth();

  beforeEach(() => {
    const mockDecodedToken: Partial<DecodedIdToken> = {
      uid: "admin123",
      email: "admin@example.com",
      aud: "firebase-app-id",
      auth_time: 1000,
      exp: 2000,
      firebase: {
        sign_in_provider: "password",
        identities: {},
      },
      iat: 1000,
      iss: "https://securetoken.google.com/project-id",
      sub: "admin123",
    };
    (mockAuthService.verifyIdToken as jest.Mock).mockResolvedValue(
      mockDecodedToken
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("POST /api/users", () => {
    test("should create a new user when admin has right permissions", async () => {
      // Setup mocks for permissions
      (User.getUserRoles as jest.Mock).mockResolvedValue({
        userId: "admin123",
        roleIds: ["admin-role"],
      });

      (RoleModel.getRoleById as jest.Mock).mockResolvedValue({
        id: "admin-role",
        name: "Administrator",
        description: "Full system access",
        permissions: ["create-users-permission"],
      });

      (RoleModel.getPermissionsByIds as jest.Mock).mockResolvedValue([
        {
          id: "create-users-permission",
          name: "Create Users",
          description: "Can create users",
          resource: "users",
          action: "create",
        },
      ]);

      (mockAuthService.createUser as jest.Mock).mockResolvedValue({
        uid: "new-user-123",
      });

      // Execute
      const response = await request(app)
        .post("/api/users")
        .set("Authorization", `Bearer ${mockToken}`)
        .send({
          email: "newuser@example.com",
          password: "Password123!",
          displayName: "New User",
          roleIds: ["user-role"],
        });

      // Assert
      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty("userId", "new-user-123");
      expect(mockAuthService.createUser).toHaveBeenCalledWith({
        email: "newuser@example.com",
        password: "Password123!",
        displayName: "New User",
        emailVerified: false,
      });
      expect(User.assignRolesToUser).toHaveBeenCalledWith("new-user-123", [
        "user-role",
      ]);
    });

    test("should return 403 when user lacks permissions", async () => {
      // Setup mocks for insufficient permissions
      (User.getUserRoles as jest.Mock).mockResolvedValue({
        userId: "regular123",
        roleIds: ["user-role"],
      });

      (RoleModel.getRoleById as jest.Mock).mockResolvedValue({
        id: "user-role",
        name: "Regular User",
        description: "Basic access",
        permissions: ["read-own-data-permission"],
      });

      (RoleModel.getPermissionsByIds as jest.Mock).mockResolvedValue([
        {
          id: "read-own-data-permission",
          name: "Read Own Data",
          description: "Can read own data",
          resource: "users",
          action: "read",
        },
      ]);

      // Execute
      const response = await request(app)
        .post("/api/users")
        .set("Authorization", `Bearer ${mockToken}`)
        .send({
          email: "newuser@example.com",
          password: "Password123!",
          displayName: "New User",
        });

      // Assert
      expect(response.status).toBe(403);
      expect(response.body).toHaveProperty(
        "error",
        "Forbidden: Insufficient permissions"
      );
      expect(mockAuthService.createUser).not.toHaveBeenCalled();
    });

    test("should return 401 when no token is provided", async () => {
      // Execute
      const response = await request(app).post("/api/users").send({
        email: "newuser@example.com",
        password: "Password123!",
        displayName: "New User",
      });

      // Assert
      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty(
        "error",
        "Unauthorized: No token provided"
      );
    });
  });

  describe("GET /api/users/:id", () => {
    test("should return user details when user has permission", async () => {
      // Setup mocks
      (User.getUserRoles as jest.Mock).mockResolvedValue({
        userId: "admin123",
        roleIds: ["admin-role"],
      });

      (RoleModel.getRoleById as jest.Mock).mockResolvedValue({
        id: "admin-role",
        name: "Administrator",
        description: "Full system access",
        permissions: ["read-users-permission"],
      });

      (RoleModel.getPermissionsByIds as jest.Mock).mockResolvedValue([
        {
          id: "read-users-permission",
          name: "Read Users",
          description: "Can read user data",
          resource: "users",
          action: "read",
        },
      ]);

      (mockAuthService.getUser as jest.Mock).mockResolvedValue({
        uid: "user-123",
        email: "user@example.com",
        displayName: "Test User",
        emailVerified: true,
        disabled: false,
        metadata: {
          creationTime: "2023-01-01T00:00:00Z",
          lastSignInTime: "2023-01-02T00:00:00Z",
        },
      });

      (User.getUserRoles as jest.Mock)
        .mockResolvedValueOnce({
          // First call for admin permissions
          userId: "admin123",
          roleIds: ["admin-role"],
        })
        .mockResolvedValueOnce({
          // Second call for target user roles
          userId: "user-123",
          roleIds: ["user-role"],
        });

      // Execute
      const response = await request(app)
        .get("/api/users/user-123")
        .set("Authorization", `Bearer ${mockToken}`);

      // Assert
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty("user");
      expect(response.body.user).toHaveProperty("uid", "user-123");
      expect(response.body).toHaveProperty("roles", ["user-role"]);
    });

    test("should allow users to get their own details without special permissions", async () => {
      // Setup mocks - user is requesting their own data
      const mockSelfDecodedToken: Partial<DecodedIdToken> = {
        uid: "self-user-123",
        email: "self@example.com",
        aud: "firebase-app-id",
        auth_time: 1000,
        exp: 2000,
        firebase: {
          sign_in_provider: "password",
          identities: {},
        },
        iat: 1000,
        iss: "https://securetoken.google.com/project-id",
        sub: "self-user-123",
      };
      (mockAuthService.verifyIdToken as jest.Mock).mockResolvedValue(
        mockSelfDecodedToken
      );

      (User.getUserRoles as jest.Mock).mockResolvedValue({
        userId: "self-user-123",
        roleIds: ["user-role"],
      });

      (RoleModel.getRoleById as jest.Mock).mockResolvedValue({
        id: "user-role",
        name: "Regular User",
        description: "Basic access",
        permissions: [], // No special permissions
      });

      (RoleModel.getPermissionsByIds as jest.Mock).mockResolvedValue([]);

      (mockAuthService.getUser as jest.Mock).mockResolvedValue({
        uid: "self-user-123",
        email: "self@example.com",
        displayName: "Self User",
        emailVerified: true,
        disabled: false,
        metadata: {
          creationTime: "2023-01-01T00:00:00Z",
          lastSignInTime: "2023-01-02T00:00:00Z",
        },
      });

      // Execute
      const response = await request(app)
        .get("/api/users/self-user-123")
        .set("Authorization", `Bearer ${mockToken}`);

      // Assert
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty("user");
      expect(response.body.user).toHaveProperty("uid", "self-user-123");
    });

    test("should return 403 when user tries to access another user without permission", async () => {
      // Setup mocks - user is requesting another user's data
      const mockRegularDecodedToken: Partial<DecodedIdToken> = {
        uid: "regular-user-123",
        email: "regular@example.com",
        aud: "firebase-app-id",
        auth_time: 1000,
        exp: 2000,
        firebase: {
          sign_in_provider: "password",
          identities: {},
        },
        iat: 1000,
        iss: "https://securetoken.google.com/project-id",
        sub: "regular-user-123",
      };
      (mockAuthService.verifyIdToken as jest.Mock).mockResolvedValue(
        mockRegularDecodedToken
      );

      (User.getUserRoles as jest.Mock).mockResolvedValue({
        userId: "regular-user-123",
        roleIds: ["user-role"],
      });

      (RoleModel.getRoleById as jest.Mock).mockResolvedValue({
        id: "user-role",
        name: "Regular User",
        description: "Basic access",
        permissions: [], // No special permissions
      });

      (RoleModel.getPermissionsByIds as jest.Mock).mockResolvedValue([]);

      // Execute
      const response = await request(app)
        .get("/api/users/some-other-user-123")
        .set("Authorization", `Bearer ${mockToken}`);

      // Assert
      expect(response.status).toBe(403);
      expect(response.body).toHaveProperty(
        "error",
        "Forbidden: Insufficient permissions"
      );
    });
  });

  describe("PUT /api/users/:id/roles", () => {
    test("should update user roles when user has permission", async () => {
      // Setup mocks
      (User.getUserRoles as jest.Mock).mockResolvedValue({
        userId: "admin123",
        roleIds: ["admin-role"],
      });

      (RoleModel.getRoleById as jest.Mock).mockResolvedValue({
        id: "admin-role",
        name: "Administrator",
        description: "Full system access",
        permissions: ["update-users-permission"],
      });

      (RoleModel.getPermissionsByIds as jest.Mock).mockResolvedValue([
        {
          id: "update-users-permission",
          name: "Update Users",
          description: "Can update user data",
          resource: "users",
          action: "update",
        },
      ]);

      (mockAuthService.getUser as jest.Mock).mockResolvedValue({
        uid: "user-123",
      });

      // Execute
      const response = await request(app)
        .put("/api/users/user-123/roles")
        .set("Authorization", `Bearer ${mockToken}`)
        .send({
          roleIds: ["new-role-1", "new-role-2"],
        });

      // Assert
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty(
        "message",
        "User roles updated successfully"
      );
      expect(User.assignRolesToUser).toHaveBeenCalledWith("user-123", [
        "new-role-1",
        "new-role-2",
      ]);
    });

    test("should return 403 when user lacks permission to update roles", async () => {
      // Setup mocks
      (User.getUserRoles as jest.Mock).mockResolvedValue({
        userId: "regular123",
        roleIds: ["user-role"],
      });

      (RoleModel.getRoleById as jest.Mock).mockResolvedValue({
        id: "user-role",
        name: "Regular User",
        description: "Basic access",
        permissions: ["read-own-data-permission"],
      });

      (RoleModel.getPermissionsByIds as jest.Mock).mockResolvedValue([
        {
          id: "read-own-data-permission",
          name: "Read Own Data",
          description: "Can read own data",
          resource: "users",
          action: "read",
        },
      ]);

      // Execute
      const response = await request(app)
        .put("/api/users/user-123/roles")
        .set("Authorization", `Bearer ${mockToken}`)
        .send({
          roleIds: ["new-role-1", "new-role-2"],
        });

      // Assert
      expect(response.status).toBe(403);
      expect(response.body).toHaveProperty(
        "error",
        "Forbidden: Insufficient permissions"
      );
      expect(User.assignRolesToUser).not.toHaveBeenCalled();
    });
  });
});
