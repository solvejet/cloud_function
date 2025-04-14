// src/tests/unit/middleware/auth.test.ts
import { Request, Response } from "express";
import { verifyToken, loadPermissions, hasPermission } from "@/middleware/auth";
import { User } from "@/models/User";
import { RoleModel } from "@/models/Role";
// Fix the import path to use absolute path with module alias
import "@/tests/utils/errorTestingUtils";

// Directly mock the specific modules we need instead of their imports
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

// Mock User and RoleModel
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

jest.mock("@/utils/logger", () => ({
  logger: {
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

// Mock the ForbiddenError constructor to ensure it creates proper error objects
jest.mock("@/utils/errors", () => {
  const originalModule = jest.requireActual("@/utils/errors");
  
  // Create a mock implementation of ForbiddenError that sets all required properties
  const mockForbiddenError = jest.fn().mockImplementation((message, errorCode, context) => {
    const error = new Error(message);
    Object.defineProperties(error, {
      statusCode: { value: 403 },
      errorCode: { value: errorCode || "FORBIDDEN" },
      context: { value: context || {} },
      name: { value: "ForbiddenError" },
      isOperational: { value: true }
    });
    return error;
  });
  
  const mockUnauthorizedError = jest.fn().mockImplementation((message, errorCode, context) => {
    const error = new Error(message);
    Object.defineProperties(error, {
      statusCode: { value: 401 },
      errorCode: { value: errorCode || "UNAUTHORIZED" },
      context: { value: context || {} },
      name: { value: "UnauthorizedError" },
      isOperational: { value: true }
    });
    return error;
  });
  
  return {
    ...originalModule,
    ForbiddenError: mockForbiddenError,
    UnauthorizedError: mockUnauthorizedError
  };
});

describe("Auth Middleware", () => {
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let nextFunction: jest.Mock;
  let mockAuth: any;

  beforeEach(() => {
    // Create fresh mock objects for each test
    mockRequest = {
      headers: {
        authorization: "Bearer valid-token",
        "x-request-id": "test-request-id",
      },
      params: {},
      path: "/test-path",
    };
    
    mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    
    nextFunction = jest.fn();
    
    // Get the mock auth instance
    mockAuth = require("@/config/firebase").auth();
    
    // Reset all mock implementations
    jest.clearAllMocks();
  });

  describe("verifyToken", () => {
    it("should call next with no errors for valid token", async () => {
      const mockDecodedToken = { uid: "test-user-id" };
      mockAuth.verifyIdToken.mockResolvedValueOnce(mockDecodedToken);

      await verifyToken(
        mockRequest as Request,
        mockResponse as Response,
        nextFunction
      );

      expect(mockAuth.verifyIdToken).toHaveBeenCalledWith("valid-token");
      expect(mockRequest.user).toEqual(mockDecodedToken);
      expect(nextFunction).toHaveBeenCalledWith();
    });

    it("should call next with UnauthorizedError when no token is provided", async () => {
      mockRequest.headers = { "x-request-id": "test-request-id" }; // No authorization header

      await verifyToken(
        mockRequest as Request,
        mockResponse as Response,
        nextFunction
      );

      // Verify nextFunction was called with an error
      expect(nextFunction).toHaveBeenCalled();
      const error = nextFunction.mock.calls[0][0];
      
      // Check properties directly
      expect(error.statusCode).toBe(401);
      expect(error.errorCode).toBe("NO_TOKEN_PROVIDED");
    });

    it("should call next with UnauthorizedError when token is invalid", async () => {
      mockAuth.verifyIdToken.mockRejectedValueOnce(new Error("Invalid token"));

      await verifyToken(
        mockRequest as Request,
        mockResponse as Response,
        nextFunction
      );

      // Verify nextFunction was called with an error
      expect(nextFunction).toHaveBeenCalled();
      const error = nextFunction.mock.calls[0][0];
      
      // Check properties directly
      expect(error.statusCode).toBe(401);
      expect(error.errorCode).toBe("INVALID_TOKEN");
    });
  });

  describe("loadPermissions", () => {
    beforeEach(() => {
      mockRequest.user = { uid: "test-user-id" };
    });

    it("should load user permissions successfully", async () => {
      const mockUserRoles = {
        userId: "test-user-id",
        roleIds: ["role1", "role2"],
      };
      
      const mockRoles = [
        {
          id: "role1",
          name: "Admin",
          description: "Admin role",
          permissions: ["perm1", "perm2"],
        },
        {
          id: "role2",
          name: "User",
          description: "User role",
          permissions: ["perm3"],
        },
      ];
      
      const mockPermissions = [
        {
          id: "perm1",
          name: "Create User",
          description: "Can create users",
          resource: "users",
          action: "create",
        },
        {
          id: "perm2",
          name: "Read User",
          description: "Can read users",
          resource: "users",
          action: "read",
        },
        {
          id: "perm3",
          name: "Read Role",
          description: "Can read roles",
          resource: "roles",
          action: "read",
        },
      ];

      // Setup mocks to return test data
      User.getUserRoles = jest.fn().mockResolvedValueOnce(mockUserRoles);
      RoleModel.getRoleById = jest.fn()
        .mockResolvedValueOnce(mockRoles[0])
        .mockResolvedValueOnce(mockRoles[1]);
      RoleModel.getPermissionsByIds = jest.fn()
        .mockResolvedValueOnce(mockPermissions);

      await loadPermissions(
        mockRequest as Request,
        mockResponse as Response,
        nextFunction
      );

      expect(User.getUserRoles).toHaveBeenCalledWith("test-user-id");
      expect(RoleModel.getRoleById).toHaveBeenCalledTimes(2);
      expect(RoleModel.getPermissionsByIds).toHaveBeenCalledWith([
        "perm1", "perm2", "perm3"
      ]);
      expect(mockRequest.permissions).toEqual(mockPermissions);
      expect(nextFunction).toHaveBeenCalledWith();
    });

    it("should set empty permissions array when user has no roles", async () => {
      User.getUserRoles = jest.fn().mockResolvedValueOnce(null);

      await loadPermissions(
        mockRequest as Request,
        mockResponse as Response,
        nextFunction
      );

      expect(mockRequest.permissions).toEqual([]);
      expect(nextFunction).toHaveBeenCalledWith();
    });

    it("should call next with UnauthorizedError when user is not authenticated", async () => {
      mockRequest.user = undefined;

      await loadPermissions(
        mockRequest as Request,
        mockResponse as Response,
        nextFunction
      );

      // Verify nextFunction was called with an error
      expect(nextFunction).toHaveBeenCalled();
      const error = nextFunction.mock.calls[0][0];
      
      // Check properties directly
      expect(error.statusCode).toBe(401);
      expect(error.errorCode).toBe("USER_NOT_AUTHENTICATED");
    });
  });

  describe("hasPermission", () => {
    beforeEach(() => {
      mockRequest.user = { uid: "test-user-id" };
      mockRequest.permissions = [
        {
          id: "perm1",
          name: "Create User",
          description: "Can create users",
          resource: "users",
          action: "create",
        },
        {
          id: "perm2",
          name: "Manage Roles",
          description: "Can manage roles",
          resource: "roles",
          action: "manage",
        },
        {
          id: "perm3",
          name: "Admin",
          description: "Full access",
          resource: "*",
          action: "manage",
        },
      ];
    });

    it("should call next() when user has exact permission", () => {
      const middleware = hasPermission("users", "create");
      middleware(
        mockRequest as Request,
        mockResponse as Response,
        nextFunction
      );

      expect(nextFunction).toHaveBeenCalledWith();
    });

    it("should call next() when user has manage permission for resource", () => {
      const middleware = hasPermission("roles", "read");
      middleware(
        mockRequest as Request,
        mockResponse as Response,
        nextFunction
      );

      expect(nextFunction).toHaveBeenCalledWith();
    });

    it("should call next() when user has wildcard manage permission", () => {
      const middleware = hasPermission("any-resource", "read");
      middleware(
        mockRequest as Request,
        mockResponse as Response,
        nextFunction
      );

      expect(nextFunction).toHaveBeenCalledWith();
    });

    it("should call next with ForbiddenError when user lacks permission", () => {
      // We'll need to inspect how the hasPermission middleware actually works
      // Mock implementation to match the middleware's behavior
      const ForbiddenError = require("@/utils/errors").ForbiddenError;
      
      const middleware = hasPermission("products", "create");
      middleware(
        mockRequest as Request,
        mockResponse as Response,
        nextFunction
      );

      // Verify nextFunction was called
      expect(nextFunction).toHaveBeenCalled();
      
      // Check that ForbiddenError constructor was called
      expect(ForbiddenError).toHaveBeenCalledWith(
        "Insufficient permissions",
        "INSUFFICIENT_PERMISSIONS",
        expect.any(Object)
      );
    });

    it("should call next with ForbiddenError when permissions are not loaded", () => {
      mockRequest.permissions = undefined;
      const middleware = hasPermission("users", "create");
      middleware(
        mockRequest as Request,
        mockResponse as Response,
        nextFunction
      );

      // Verify nextFunction was called with an error
      expect(nextFunction).toHaveBeenCalled();
      const error = nextFunction.mock.calls[0][0];
      
      // Check properties directly
      expect(error.statusCode).toBe(403);
      expect(error.errorCode).toBe("PERMISSIONS_NOT_LOADED");
    });
  });
});