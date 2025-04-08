import { Request, Response } from "express";
import { RoleModel } from "../../../models/Role";
import {
  createRole,
  getAllRoles,
  createPermission,
} from "../../../controllers/rbacController";

// Mock types
type MockRequest = Partial<Request>;
type MockResponse = Partial<Response> & {
  status: jest.Mock;
  json: jest.Mock;
};

// Mock Role model
jest.mock("../../../models/Role", () => ({
  RoleModel: {
    createRole: jest.fn(),
    getAllRoles: jest.fn(),
    createPermission: jest.fn(),
  },
}));

describe("RBAC Controller", () => {
  let mockRequest: MockRequest;
  let mockResponse: MockResponse;

  beforeEach(() => {
    mockRequest = {};
    mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("createRole", () => {
    test("should create a role successfully", async () => {
      // Setup
      mockRequest.body = {
        name: "Test Role",
        description: "Test role description",
        permissions: ["perm1", "perm2"],
      };

      const createdRole = {
        id: "role123",
        name: "Test Role",
        description: "Test role description",
        permissions: ["perm1", "perm2"],
      };

      (RoleModel.createRole as jest.Mock).mockResolvedValue(createdRole);

      // Execute
      await createRole(mockRequest as Request, mockResponse as Response);

      // Assert
      expect(RoleModel.createRole).toHaveBeenCalledWith({
        name: "Test Role",
        description: "Test role description",
        permissions: ["perm1", "perm2"],
      });
      expect(mockResponse.status).toHaveBeenCalledWith(201);
      expect(mockResponse.json).toHaveBeenCalledWith({
        message: "Role created successfully",
        role: createdRole,
      });
    });

    test("should handle errors when creating a role", async () => {
      // Setup
      mockRequest.body = {
        name: "Test Role",
        description: "Test role description",
        permissions: ["perm1", "perm2"],
      };

      const error = new Error("Role creation failed");
      (RoleModel.createRole as jest.Mock).mockRejectedValue(error);

      // Execute
      await createRole(mockRequest as Request, mockResponse as Response);

      // Assert
      expect(RoleModel.createRole).toHaveBeenCalled();
      expect(mockResponse.status).toHaveBeenCalledWith(500);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: "Failed to create role",
      });
    });
  });

  describe("getAllRoles", () => {
    test("should return all roles successfully", async () => {
      // Setup
      const roles = [
        {
          id: "role1",
          name: "Admin",
          description: "Administrator role",
          permissions: ["perm1", "perm2"],
        },
        {
          id: "role2",
          name: "User",
          description: "Regular user",
          permissions: ["perm3"],
        },
      ];

      (RoleModel.getAllRoles as jest.Mock).mockResolvedValue(roles);

      // Execute
      await getAllRoles(mockRequest as Request, mockResponse as Response);

      // Assert
      expect(RoleModel.getAllRoles).toHaveBeenCalled();
      expect(mockResponse.status).toHaveBeenCalledWith(200);
      expect(mockResponse.json).toHaveBeenCalledWith({ roles });
    });

    test("should handle errors when fetching roles", async () => {
      // Setup
      const error = new Error("Failed to fetch roles");
      (RoleModel.getAllRoles as jest.Mock).mockRejectedValue(error);

      // Execute
      await getAllRoles(mockRequest as Request, mockResponse as Response);

      // Assert
      expect(RoleModel.getAllRoles).toHaveBeenCalled();
      expect(mockResponse.status).toHaveBeenCalledWith(500);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: "Failed to fetch roles",
      });
    });
  });

  describe("createPermission", () => {
    test("should create a permission successfully", async () => {
      // Setup
      mockRequest.body = {
        name: "Read Users",
        description: "Permission to read user data",
        resource: "users",
        action: "read",
      };

      const createdPermission = {
        id: "perm123",
        name: "Read Users",
        description: "Permission to read user data",
        resource: "users",
        action: "read",
      };

      (RoleModel.createPermission as jest.Mock).mockResolvedValue(
        createdPermission
      );

      // Execute
      await createPermission(mockRequest as Request, mockResponse as Response);

      // Assert
      expect(RoleModel.createPermission).toHaveBeenCalledWith({
        name: "Read Users",
        description: "Permission to read user data",
        resource: "users",
        action: "read",
      });
      expect(mockResponse.status).toHaveBeenCalledWith(201);
      expect(mockResponse.json).toHaveBeenCalledWith({
        message: "Permission created successfully",
        permission: createdPermission,
      });
    });

    test("should handle errors when creating a permission", async () => {
      // Setup
      mockRequest.body = {
        name: "Read Users",
        description: "Permission to read user data",
        resource: "users",
        action: "read",
      };

      const error = new Error("Permission creation failed");
      (RoleModel.createPermission as jest.Mock).mockRejectedValue(error);

      // Execute
      await createPermission(mockRequest as Request, mockResponse as Response);

      // Assert
      expect(RoleModel.createPermission).toHaveBeenCalled();
      expect(mockResponse.status).toHaveBeenCalledWith(500);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: "Failed to create permission",
      });
    });
  });
});
