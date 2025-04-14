// src/tests/unit/controllers/rbacController.test.ts
import { Request, Response } from "express";
import {
  createRole,
  getAllRoles,
  createPermission,
} from "@/controllers/rbacController";
import { RoleModel } from "@/models/Role";
import { Role, Permission } from "@/types/auth";
import { ConflictError } from "@/utils/errors";

// Mock dependencies
jest.mock("@/models/Role");
jest.mock("@/utils/logger", () => ({
  logger: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

describe("RBAC Controller", () => {
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let jsonMock: jest.Mock;
  let statusMock: jest.Mock;

  beforeEach(() => {
    jsonMock = jest.fn();
    statusMock = jest.fn().mockReturnValue({ json: jsonMock });

    mockRequest = {
      body: {},
    };

    mockResponse = {
      status: statusMock,
      json: jsonMock,
    };

    jest.clearAllMocks();
  });

  describe("createRole", () => {
    it("should create a role successfully", async () => {
      const mockRole: Role = {
        id: "role-1",
        name: "Admin",
        description: "Administrator role",
        permissions: ["perm-1", "perm-2"],
      };

      mockRequest.body = {
        name: "Admin",
        description: "Administrator role",
        permissions: ["perm-1", "perm-2"],
      };

      (RoleModel.createRole as jest.Mock).mockResolvedValue(mockRole);

      await createRole(mockRequest as Request, mockResponse as Response);

      expect(RoleModel.createRole).toHaveBeenCalledWith({
        name: "Admin",
        description: "Administrator role",
        permissions: ["perm-1", "perm-2"],
      });

      expect(statusMock).toHaveBeenCalledWith(201);
      expect(jsonMock).toHaveBeenCalledWith({
        message: "Role created successfully",
        role: mockRole,
      });
    });

    it("should handle conflict error when role name already exists", async () => {
      mockRequest.body = {
        name: "Admin",
        description: "Administrator role",
        permissions: [],
      };

      const error = new ConflictError(
        'Role with name "Admin" already exists',
        "ROLE_NAME_EXISTS"
      );
      (RoleModel.createRole as jest.Mock).mockRejectedValue(error);

      await createRole(mockRequest as Request, mockResponse as Response);

      expect(statusMock).toHaveBeenCalledWith(409);
      expect(jsonMock).toHaveBeenCalledWith({
        error: "Failed to create role",
        message: 'Role with name "Admin" already exists',
      });
    });
  });

  describe("getAllRoles", () => {
    it("should get all roles successfully", async () => {
      const mockRoles: Role[] = [
        {
          id: "role-1",
          name: "Admin",
          description: "Administrator role",
          permissions: ["perm-1", "perm-2"],
        },
        {
          id: "role-2",
          name: "User",
          description: "Standard user role",
          permissions: ["perm-3"],
        },
      ];

      (RoleModel.getAllRoles as jest.Mock).mockResolvedValue({
        roles: mockRoles,
        hasMore: false,
      });

      await getAllRoles(mockRequest as Request, mockResponse as Response);

      expect(RoleModel.getAllRoles).toHaveBeenCalled();
      expect(statusMock).toHaveBeenCalledWith(200);
      expect(jsonMock).toHaveBeenCalledWith({ roles: mockRoles });
    });

    it("should handle errors when fetching roles", async () => {
      const error = new Error("Database error");
      (RoleModel.getAllRoles as jest.Mock).mockRejectedValue(error);

      await getAllRoles(mockRequest as Request, mockResponse as Response);

      expect(statusMock).toHaveBeenCalledWith(500);
      expect(jsonMock).toHaveBeenCalledWith({
        error: "Failed to fetch roles",
        message: "Database error",
      });
    });
  });

  describe("createPermission", () => {
    it("should create a permission successfully", async () => {
      const mockPermission: Permission = {
        id: "perm-1",
        name: "Create User",
        description: "Can create users",
        resource: "users",
        action: "create",
      };

      mockRequest.body = {
        name: "Create User",
        description: "Can create users",
        resource: "users",
        action: "create",
      };

      (RoleModel.createPermission as jest.Mock).mockResolvedValue(
        mockPermission
      );

      await createPermission(mockRequest as Request, mockResponse as Response);

      expect(RoleModel.createPermission).toHaveBeenCalledWith({
        name: "Create User",
        description: "Can create users",
        resource: "users",
        action: "create",
      });

      expect(statusMock).toHaveBeenCalledWith(201);
      expect(jsonMock).toHaveBeenCalledWith({
        message: "Permission created successfully",
        permission: mockPermission,
      });
    });

    it("should handle conflict error when permission already exists", async () => {
      mockRequest.body = {
        name: "Create User",
        description: "Can create users",
        resource: "users",
        action: "create",
      };

      const error = new ConflictError(
        'Permission "users:create" already exists',
        "PERMISSION_EXISTS"
      );
      (RoleModel.createPermission as jest.Mock).mockRejectedValue(error);

      await createPermission(mockRequest as Request, mockResponse as Response);

      expect(statusMock).toHaveBeenCalledWith(409);
      expect(jsonMock).toHaveBeenCalledWith({
        error: "Failed to create permission",
        message: 'Permission "users:create" already exists',
      });
    });
  });
});
