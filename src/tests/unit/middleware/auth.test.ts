import { Request, Response } from "express";
import {
  verifyToken,
  loadPermissions,
  hasPermission,
} from "../../../middleware/auth";
import { auth } from "../../../config/firebase";
import { User } from "../../../models/User";
import { RoleModel } from "../../../models/Role";
import { DecodedIdToken } from "firebase-admin/auth";

// Mock types
type MockRequest = Partial<Request>;
type MockResponse = Partial<Response> & {
  status: jest.Mock;
  json: jest.Mock;
};
type MockNext = jest.Mock;

// Mock Firebase auth and models
jest.mock("../../../config/firebase", () => ({
  auth: jest.fn().mockReturnValue({
    verifyIdToken: jest.fn(),
  }),
}));

jest.mock("../../../models/User", () => ({
  User: {
    getUserRoles: jest.fn(),
  },
}));

jest.mock("../../../models/Role", () => ({
  RoleModel: {
    getRoleById: jest.fn(),
    getPermissionsByIds: jest.fn(),
  },
}));

describe("Auth Middleware", () => {
  let mockRequest: MockRequest;
  let mockResponse: MockResponse;
  let mockNext: MockNext;

  beforeEach(() => {
    mockRequest = {
      headers: {},
      user: undefined,
      permissions: undefined,
    };

    mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };

    mockNext = jest.fn();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("verifyToken", () => {
    test("should verify a valid token and call next", async () => {
      // Setup
      const mockToken = "valid-token";
      mockRequest.headers = {
        authorization: `Bearer ${mockToken}`,
      };

      const mockDecodedToken: DecodedIdToken = {
        uid: "user123",
        email: "user@example.com",
        aud: "firebase-app-id",
        auth_time: 1000,
        exp: 2000,
        firebase: {
          sign_in_provider: "password",
          identities: {},
        },
        iat: 1000,
        iss: "https://securetoken.google.com/project-id",
        sub: "user123",
      };

      (auth().verifyIdToken as jest.Mock).mockResolvedValue(mockDecodedToken);

      // Execute
      await verifyToken(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      // Assert
      expect(auth().verifyIdToken).toHaveBeenCalledWith(mockToken);
      expect(mockRequest.user).toEqual(mockDecodedToken);
      expect(mockNext).toHaveBeenCalled();
      expect(mockResponse.status).not.toHaveBeenCalled();
    });

    test("should return 401 when no token is provided", async () => {
      // Execute
      await verifyToken(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      // Assert
      expect(auth().verifyIdToken).not.toHaveBeenCalled();
      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: "Unauthorized: No token provided",
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    test("should return 401 when token is invalid", async () => {
      // Setup
      mockRequest.headers = {
        authorization: "Bearer invalid-token",
      };

      const error = new Error("Invalid token");
      (auth().verifyIdToken as jest.Mock).mockRejectedValue(error);

      // Execute
      await verifyToken(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      // Assert
      expect(auth().verifyIdToken).toHaveBeenCalledWith("invalid-token");
      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: "Unauthorized: Invalid token",
      });
      expect(mockNext).not.toHaveBeenCalled();
    });
  });

  describe("loadPermissions", () => {
    test("should load user permissions and call next", async () => {
      // Setup
      mockRequest.user = {
        uid: "user123",
        email: "user@example.com",
        aud: "firebase-app-id",
        auth_time: 1000,
        exp: 2000,
        firebase: {
          sign_in_provider: "password",
          identities: {},
        },
        iat: 1000,
        iss: "https://securetoken.google.com/project-id",
        sub: "user123",
      };

      const userRoles = {
        userId: "user123",
        roleIds: ["role1", "role2"],
      };

      const role1 = {
        id: "role1",
        name: "Admin",
        description: "Administrator",
        permissions: ["perm1", "perm2"],
      };

      const role2 = {
        id: "role2",
        name: "Editor",
        description: "Content Editor",
        permissions: ["perm3"],
      };

      const permissions = [
        {
          id: "perm1",
          name: "Create Users",
          description: "Can create users",
          resource: "users",
          action: "create",
        },
        {
          id: "perm2",
          name: "Read Users",
          description: "Can read users",
          resource: "users",
          action: "read",
        },
        {
          id: "perm3",
          name: "Update Content",
          description: "Can update content",
          resource: "content",
          action: "update",
        },
      ];

      (User.getUserRoles as jest.Mock).mockResolvedValue(userRoles);
      (RoleModel.getRoleById as jest.Mock)
        .mockResolvedValueOnce(role1)
        .mockResolvedValueOnce(role2);
      (RoleModel.getPermissionsByIds as jest.Mock).mockResolvedValue(
        permissions
      );

      // Execute
      await loadPermissions(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      // Assert
      expect(User.getUserRoles).toHaveBeenCalledWith("user123");
      expect(RoleModel.getRoleById).toHaveBeenCalledWith("role1");
      expect(RoleModel.getRoleById).toHaveBeenCalledWith("role2");
      expect(RoleModel.getPermissionsByIds).toHaveBeenCalledWith([
        "perm1",
        "perm2",
        "perm3",
      ]);
      expect(mockRequest.permissions).toEqual(permissions);
      expect(mockNext).toHaveBeenCalled();
    });

    test("should set empty permissions when user has no roles", async () => {
      // Setup
      mockRequest.user = {
        uid: "user123",
        email: "user@example.com",
        aud: "firebase-app-id",
        auth_time: 1000,
        exp: 2000,
        firebase: {
          sign_in_provider: "password",
          identities: {},
        },
        iat: 1000,
        iss: "https://securetoken.google.com/project-id",
        sub: "user123",
      };

      (User.getUserRoles as jest.Mock).mockResolvedValue(null);

      // Execute
      await loadPermissions(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      // Assert
      expect(User.getUserRoles).toHaveBeenCalledWith("user123");
      expect(RoleModel.getRoleById).not.toHaveBeenCalled();
      expect(RoleModel.getPermissionsByIds).not.toHaveBeenCalled();
      expect(mockRequest.permissions).toEqual([]);
      expect(mockNext).toHaveBeenCalled();
    });

    test("should return 401 when user is not authenticated", async () => {
      // Execute
      await loadPermissions(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      // Assert
      expect(User.getUserRoles).not.toHaveBeenCalled();
      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: "Unauthorized: User not authenticated",
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    test("should handle errors while loading permissions", async () => {
      // Setup
      mockRequest.user = {
        uid: "user123",
        email: "user@example.com",
        aud: "firebase-app-id",
        auth_time: 1000,
        exp: 2000,
        firebase: {
          sign_in_provider: "password",
          identities: {},
        },
        iat: 1000,
        iss: "https://securetoken.google.com/project-id",
        sub: "user123",
      };

      const error = new Error("Database error");
      (User.getUserRoles as jest.Mock).mockRejectedValue(error);

      // Execute
      await loadPermissions(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      // Assert
      expect(User.getUserRoles).toHaveBeenCalledWith("user123");
      expect(mockResponse.status).toHaveBeenCalledWith(500);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: "Internal server error",
      });
      expect(mockNext).not.toHaveBeenCalled();
    });
  });

  describe("hasPermission", () => {
    test("should allow access when user has exact permission", () => {
      // Setup
      mockRequest.permissions = [
        {
          id: "perm1",
          name: "Create Users",
          description: "Can create users",
          resource: "users",
          action: "create",
        },
        {
          id: "perm2",
          name: "Read Users",
          description: "Can read users",
          resource: "users",
          action: "read",
        },
      ];

      // Create middleware instance
      const middleware = hasPermission("users", "read");

      // Execute
      middleware(mockRequest as Request, mockResponse as Response, mockNext);

      // Assert
      expect(mockNext).toHaveBeenCalled();
      expect(mockResponse.status).not.toHaveBeenCalled();
    });

    test("should allow access when user has manage permission for the resource", () => {
      // Setup
      mockRequest.permissions = [
        {
          id: "perm1",
          name: "Manage Users",
          description: "Can manage users",
          resource: "users",
          action: "manage",
        },
      ];

      // Create middleware instance
      const middleware = hasPermission("users", "read");

      // Execute
      middleware(mockRequest as Request, mockResponse as Response, mockNext);

      // Assert
      expect(mockNext).toHaveBeenCalled();
      expect(mockResponse.status).not.toHaveBeenCalled();
    });

    test("should allow access when user has system-wide manage permission", () => {
      // Setup
      mockRequest.permissions = [
        {
          id: "perm1",
          name: "System Admin",
          description: "Full system access",
          resource: "*",
          action: "manage",
        },
      ];

      // Create middleware instance
      const middleware = hasPermission("users", "delete");

      // Execute
      middleware(mockRequest as Request, mockResponse as Response, mockNext);

      // Assert
      expect(mockNext).toHaveBeenCalled();
      expect(mockResponse.status).not.toHaveBeenCalled();
    });

    test("should deny access when user lacks required permission", () => {
      // Setup
      mockRequest.permissions = [
        {
          id: "perm1",
          name: "Read Users",
          description: "Can read users",
          resource: "users",
          action: "read",
        },
      ];

      // Create middleware instance
      const middleware = hasPermission("users", "create");

      // Execute
      middleware(mockRequest as Request, mockResponse as Response, mockNext);

      // Assert
      expect(mockNext).not.toHaveBeenCalled();
      expect(mockResponse.status).toHaveBeenCalledWith(403);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: "Forbidden: Insufficient permissions",
      });
    });

    test("should return 403 when permissions are not loaded", () => {
      // Create middleware instance
      const middleware = hasPermission("users", "read");

      // Execute
      middleware(mockRequest as Request, mockResponse as Response, mockNext);

      // Assert
      expect(mockNext).not.toHaveBeenCalled();
      expect(mockResponse.status).toHaveBeenCalledWith(403);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: "Forbidden: Permissions not loaded",
      });
    });
  });
});
