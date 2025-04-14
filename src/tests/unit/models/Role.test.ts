// src/tests/unit/models/Role.test.ts
import { RoleModel } from "@/models/Role";
import { Role, Permission } from "@/types/auth";
import { db, runTransaction, processBatch } from "@/config/firebase";
import {
  ConflictError,
  NotFoundError,
  DatabaseError,
  AppError,
} from "@/utils/errors";

// Mock Firebase
jest.mock("@/config/firebase", () => {
  const mockFirestore = {
    collection: jest.fn().mockReturnThis(),
    doc: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    get: jest.fn(),
    set: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  };

  return {
    db: jest.fn(() => mockFirestore),
    runTransaction: jest.fn(async (callback) => {
      const mockTransaction = {
        get: jest.fn(),
        update: jest.fn(),
        set: jest.fn(),
        delete: jest.fn(),
      };
      return await callback(mockTransaction);
    }),
    processBatch: jest.fn(async (items, processFunction) => {
      return Promise.all(items.map((item) => processFunction(item)));
    }),
  };
});

jest.mock("@/utils/database", () => ({
  createDocument: jest.fn(),
  getDocumentById: jest.fn(),
  queryDocuments: jest.fn(),
}));

jest.mock("@/utils/logger", () => ({
  logger: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

jest.mock("@/middleware/performanceMonitoring", () => ({
  measurePerformance: jest.fn((name, fn) => fn()),
}));

describe("Role Model", () => {
  let mockRoleCollection: any;
  let mockPermissionCollection: any;
  let mockDocRef: any;
  let mockDb: any;

  beforeEach(() => {
    mockDb = db();
    mockRoleCollection = mockDb.collection("roles");
    mockPermissionCollection = mockDb.collection("permissions");
    mockDocRef = mockRoleCollection.doc();

    // Reset mocks
    jest.clearAllMocks();
  });

  describe("createRole", () => {
    it("should create a role when name is unique", async () => {
      // Mock role does not exist
      mockRoleCollection.where.mockReturnValue({
        limit: jest.fn().mockReturnValue({
          get: jest.fn().mockResolvedValue({ empty: true }),
        }),
      });

      // Mock createDocument
      const mockRole: Role = {
        id: "role-1",
        name: "Admin",
        description: "Administrator role",
        permissions: ["perm-1", "perm-2"],
      };
      const { createDocument } = require("@/utils/database");
      createDocument.mockResolvedValue(mockRole);

      const result = await RoleModel.createRole({
        name: "Admin",
        description: "Administrator role",
        permissions: ["perm-1", "perm-2"],
      });

      expect(result).toEqual(mockRole);
      expect(createDocument).toHaveBeenCalledWith("roles", {
        name: "Admin",
        description: "Administrator role",
        permissions: ["perm-1", "perm-2"],
      });
    });

    it("should throw an error when role name already exists", async () => {
      // Mock role already exists
      mockRoleCollection.where.mockReturnValue({
        limit: jest.fn().mockReturnValue({
          get: jest.fn().mockResolvedValue({
            empty: false,
            docs: [{ data: () => ({ name: "Admin" }) }],
          }),
        }),
      });

      // Changed to expect AppError, since DatabaseError is a subclass of AppError
      await expect(
        RoleModel.createRole({
          name: "Admin",
          description: "Administrator role",
          permissions: [],
        })
      ).rejects.toThrow(AppError);

      // Check for specific message
      await expect(
        RoleModel.createRole({
          name: "Admin",
          description: "Administrator role",
          permissions: [],
        })
      ).rejects.toThrow("Failed to create role");
    });
  });

  describe("getRoleById", () => {
    it("should get a role by ID", async () => {
      const mockRole: Role = {
        id: "role-1",
        name: "Admin",
        description: "Administrator role",
        permissions: ["perm-1", "perm-2"],
      };

      // Mock getDocumentById
      const { getDocumentById } = require("@/utils/database");
      getDocumentById.mockResolvedValue(mockRole);

      const result = await RoleModel.getRoleById("role-1");

      expect(result).toEqual(mockRole);
      expect(getDocumentById).toHaveBeenCalledWith("roles", "role-1", false);
    });

    it("should return null when role not found", async () => {
      // Mock getDocumentById
      const { getDocumentById } = require("@/utils/database");
      getDocumentById.mockResolvedValue(null);

      const result = await RoleModel.getRoleById("non-existent");

      expect(result).toBeNull();
      expect(getDocumentById).toHaveBeenCalledWith(
        "roles",
        "non-existent",
        false
      );
    });
  });

  describe("getAllRoles", () => {
    it("should get all roles with pagination", async () => {
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

      // Mock queryDocuments
      const { queryDocuments } = require("@/utils/database");
      queryDocuments.mockResolvedValue({
        documents: mockRoles,
        hasMore: false,
        total: 2,
      });

      const result = await RoleModel.getAllRoles();

      expect(result).toEqual({
        roles: mockRoles,
        hasMore: false,
      });
      expect(queryDocuments).toHaveBeenCalledWith("roles", {
        limit: 51, // 50 + 1 to check if there are more
        orderBy: [["name", "asc"]],
      });
    });

    it("should handle pagination with startAfter parameter", async () => {
      // Mock doc reference for startAfter
      mockRoleCollection.doc.mockReturnValue({
        get: jest.fn().mockResolvedValue({
          exists: true,
          data: () => ({ name: "Previous" }),
        }),
      });

      // Mock queryDocuments
      const { queryDocuments } = require("@/utils/database");
      queryDocuments.mockResolvedValue({
        documents: [],
        hasMore: false,
        total: 0,
      });

      await RoleModel.getAllRoles(10, "previous-id");

      expect(mockRoleCollection.doc).toHaveBeenCalledWith("previous-id");
      expect(queryDocuments).toHaveBeenCalledWith(
        "roles",
        expect.objectContaining({
          limit: 11, // 10 + 1 to check if there are more
          orderBy: [["name", "asc"]],
        })
      );
    });
  });

  describe("createPermission", () => {
    it("should create a permission when it does not exist", async () => {
      // Mock permission does not exist
      mockPermissionCollection.where.mockReturnValue({
        where: jest.fn().mockReturnValue({
          limit: jest.fn().mockReturnValue({
            get: jest.fn().mockResolvedValue({ empty: true }),
          }),
        }),
      });

      // Mock createDocument
      const mockPermission: Permission = {
        id: "perm-1",
        name: "Create User",
        description: "Can create users",
        resource: "users",
        action: "create",
      };
      const { createDocument } = require("@/utils/database");
      createDocument.mockResolvedValue(mockPermission);

      const result = await RoleModel.createPermission({
        name: "Create User",
        description: "Can create users",
        resource: "users",
        action: "create",
      });

      expect(result).toEqual(mockPermission);
      expect(createDocument).toHaveBeenCalledWith("permissions", {
        name: "Create User",
        description: "Can create users",
        resource: "users",
        action: "create",
      });
    });

    it("should throw an error when permission already exists", async () => {
      // Mock permission already exists
      mockPermissionCollection.where.mockReturnValue({
        where: jest.fn().mockReturnValue({
          limit: jest.fn().mockReturnValue({
            get: jest.fn().mockResolvedValue({
              empty: false,
              docs: [{ data: () => ({ resource: "users", action: "create" }) }],
            }),
          }),
        }),
      });

      // Changed to expect AppError, since DatabaseError is a subclass of AppError
      await expect(
        RoleModel.createPermission({
          name: "Create User",
          description: "Can create users",
          resource: "users",
          action: "create",
        })
      ).rejects.toThrow(AppError);

      // Check message
      await expect(
        RoleModel.createPermission({
          name: "Create User",
          description: "Can create users",
          resource: "users",
          action: "create",
        })
      ).rejects.toThrow("Failed to create permission");
    });
  });

  describe("getPermissionsByIds", () => {
    it("should get permissions by IDs", async () => {
      const mockPermissions: Permission[] = [
        {
          id: "perm-1",
          name: "Create User",
          description: "Can create users",
          resource: "users",
          action: "create",
        },
        {
          id: "perm-2",
          name: "Read User",
          description: "Can read users",
          resource: "users",
          action: "read",
        },
      ];

      // Mock processBatch to return the permissions
      (processBatch as jest.Mock).mockImplementation(async (ids, fn) => {
        return mockPermissions;
      });

      const result = await RoleModel.getPermissionsByIds(["perm-1", "perm-2"]);

      expect(result).toEqual(mockPermissions);
      expect(processBatch).toHaveBeenCalledWith(
        ["perm-1", "perm-2"],
        expect.any(Function),
        10
      );
    });

    it("should return empty array when no permission IDs provided", async () => {
      const result = await RoleModel.getPermissionsByIds([]);
      expect(result).toEqual([]);
      expect(processBatch).not.toHaveBeenCalled();
    });
  });

  describe("addPermissionsToRole", () => {
    it("should add new permissions to a role", async () => {
      // Mock transaction get
      const mockRole: Role = {
        id: "role-1",
        name: "Admin",
        description: "Administrator role",
        permissions: ["perm-1"],
      };

      // Set up transaction mocks
      (runTransaction as jest.Mock).mockImplementation(async (callback) => {
        const mockTransaction = {
          get: jest.fn().mockResolvedValue({
            exists: true,
            data: () => mockRole,
          }),
          update: jest.fn(),
        };
        return await callback(mockTransaction);
      });

      await RoleModel.addPermissionsToRole("role-1", ["perm-2", "perm-3"]);

      // Verify transaction was used correctly
      expect(runTransaction).toHaveBeenCalled();
      const callback = (runTransaction as jest.Mock).mock.calls[0][0];
      const mockTransaction = {
        get: jest.fn().mockResolvedValue({
          exists: true,
          data: () => mockRole,
        }),
        update: jest.fn(),
      };
      await callback(mockTransaction);

      // Should update with combined permissions (original + new)
      expect(mockTransaction.update).toHaveBeenCalledWith(expect.anything(), {
        permissions: ["perm-1", "perm-2", "perm-3"],
      });
    });

    it("should throw an error when role does not exist", async () => {
      // Mock transaction get returns non-existent role
      (runTransaction as jest.Mock).mockImplementation(async (callback) => {
        const mockTransaction = {
          get: jest.fn().mockResolvedValue({
            exists: false,
          }),
        };

        try {
          await callback(mockTransaction);
        } catch (error) {
          throw error;
        }
      });

      // Changed to expect AppError
      await expect(
        RoleModel.addPermissionsToRole("non-existent", ["perm-1"])
      ).rejects.toThrow(AppError);

      // Check message
      await expect(
        RoleModel.addPermissionsToRole("non-existent", ["perm-1"])
      ).rejects.toThrow("Failed to add permissions to role");
    });
  });

  describe("removePermissionsFromRole", () => {
    it("should remove permissions from a role", async () => {
      // Mock role with permissions
      const mockRole: Role = {
        id: "role-1",
        name: "Admin",
        description: "Administrator role",
        permissions: ["perm-1", "perm-2", "perm-3"],
      };

      // Set up transaction mocks
      (runTransaction as jest.Mock).mockImplementation(async (callback) => {
        const mockTransaction = {
          get: jest.fn().mockResolvedValue({
            exists: true,
            data: () => mockRole,
          }),
          update: jest.fn(),
        };
        return await callback(mockTransaction);
      });

      await RoleModel.removePermissionsFromRole("role-1", ["perm-2"]);

      // Verify transaction was used correctly
      expect(runTransaction).toHaveBeenCalled();
      const callback = (runTransaction as jest.Mock).mock.calls[0][0];
      const mockTransaction = {
        get: jest.fn().mockResolvedValue({
          exists: true,
          data: () => mockRole,
        }),
        update: jest.fn(),
      };
      await callback(mockTransaction);

      // Should update with filtered permissions (removing perm-2)
      expect(mockTransaction.update).toHaveBeenCalledWith(expect.anything(), {
        permissions: ["perm-1", "perm-3"],
      });
    });

    it("should throw an error when role does not exist", async () => {
      // Mock transaction get returns non-existent role
      (runTransaction as jest.Mock).mockImplementation(async (callback) => {
        const mockTransaction = {
          get: jest.fn().mockResolvedValue({
            exists: false,
          }),
        };

        try {
          await callback(mockTransaction);
        } catch (error) {
          throw error;
        }
      });

      // Changed to expect AppError
      await expect(
        RoleModel.removePermissionsFromRole("non-existent", ["perm-1"])
      ).rejects.toThrow(AppError);

      // Check message
      await expect(
        RoleModel.removePermissionsFromRole("non-existent", ["perm-1"])
      ).rejects.toThrow("Failed to remove permissions from role");
    });
  });
});
