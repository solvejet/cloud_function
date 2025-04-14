import { db, runTransaction, processBatch } from "@/config/firebase";
import { Role, Permission } from "@/types/auth";
import { logger } from "@/utils/logger";
import { DatabaseError, NotFoundError, ConflictError } from "@/utils/errors";
import {
  createDocument,
  getDocumentById,
  queryDocuments,
} from "@/utils/database";
import { measurePerformance } from "@/middleware/performanceMonitoring";

export class RoleModel {
  private static rolesCollection = db().collection("roles");
  private static permissionsCollection = db().collection("permissions");

  /**
   * Create a new role with enhanced error handling
   */
  static async createRole(role: Omit<Role, "id">): Promise<Role> {
    return await measurePerformance(
      "RoleModel.createRole",
      async () => {
        try {
          // Check if role with same name already exists
          const existingRoles = await this.rolesCollection
            .where("name", "==", role.name)
            .limit(1)
            .get();

          if (!existingRoles.empty) {
            logger.warn({
              message: "Attempted to create duplicate role",
              roleName: role.name,
            });

            throw new ConflictError(
              `Role with name "${role.name}" already exists`,
              "ROLE_NAME_EXISTS",
              { roleName: role.name }
            );
          }

          // Create the role document
          const roleWithId = await createDocument<Role>("roles", role);

          logger.info({
            message: "Role created successfully",
            roleId: roleWithId.id,
            roleName: roleWithId.name,
            permissionCount: roleWithId.permissions.length,
          });

          return roleWithId;
        } catch (error) {
          // Re-throw conflict error
          if (error instanceof ConflictError) {
            throw error;
          }

          logger.error({
            message: "Error creating role",
            roleName: role.name,
            error: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined,
          });

          throw new DatabaseError(
            "Failed to create role",
            "ROLE_CREATE_ERROR",
            { roleName: role.name }
          );
        }
      },
      500 // 500ms threshold
    );
  }

  /**
   * Get a role by ID with enhanced error handling
   */
  static async getRoleById(roleId: string): Promise<Role | null> {
    return await measurePerformance(
      "RoleModel.getRoleById",
      async () => {
        return await getDocumentById<Role>("roles", roleId, false);
      },
      500 // 500ms threshold
    );
  }

  /**
   * Get all roles with pagination support
   */
  static async getAllRoles(
    limit = 50,
    startAfter?: string
  ): Promise<{
    roles: Role[];
    hasMore: boolean;
  }> {
    return await measurePerformance(
      "RoleModel.getAllRoles",
      async () => {
        try {
          // Set up query options
          const options: Parameters<typeof queryDocuments>[1] = {
            limit: limit + 1, // Fetch one extra to determine if there are more
            orderBy: [["name", "asc"]],
          };

          // Add startAfter cursor if provided
          if (startAfter) {
            const startAfterDoc = await this.rolesCollection
              .doc(startAfter)
              .get();
            if (startAfterDoc.exists) {
              options.startAfter = startAfterDoc;
            }
          }

          // Execute query
          const { documents } = await queryDocuments<Role>("roles", options);

          // Check if there are more results
          const hasMore = documents.length > limit;
          const roles = hasMore ? documents.slice(0, limit) : documents;

          logger.debug({
            message: "Retrieved roles",
            count: roles.length,
            hasMore,
          });

          return { roles, hasMore };
        } catch (error) {
          logger.error({
            message: "Error fetching roles",
            error: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined,
          });

          throw new DatabaseError("Failed to fetch roles", "ROLES_FETCH_ERROR");
        }
      },
      1000 // 1000ms threshold (could be many roles)
    );
  }

  /**
   * Create a new permission with enhanced error handling
   */
  static async createPermission(
    permission: Omit<Permission, "id">
  ): Promise<Permission> {
    return await measurePerformance(
      "RoleModel.createPermission",
      async () => {
        try {
          // Check if permission already exists
          const existingPermissions = await this.permissionsCollection
            .where("resource", "==", permission.resource)
            .where("action", "==", permission.action)
            .limit(1)
            .get();

          if (!existingPermissions.empty) {
            logger.warn({
              message: "Attempted to create duplicate permission",
              resource: permission.resource,
              action: permission.action,
            });

            throw new ConflictError(
              `Permission "${permission.resource}:${permission.action}" already exists`,
              "PERMISSION_EXISTS",
              {
                resource: permission.resource,
                action: permission.action,
              }
            );
          }

          // Create the permission document
          const permissionWithId = await createDocument<Permission>(
            "permissions",
            permission
          );

          logger.info({
            message: "Permission created successfully",
            permissionId: permissionWithId.id,
            resource: permissionWithId.resource,
            action: permissionWithId.action,
          });

          return permissionWithId;
        } catch (error) {
          // Re-throw conflict error
          if (error instanceof ConflictError) {
            throw error;
          }

          logger.error({
            message: "Error creating permission",
            resource: permission.resource,
            action: permission.action,
            error: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined,
          });

          throw new DatabaseError(
            "Failed to create permission",
            "PERMISSION_CREATE_ERROR",
            {
              resource: permission.resource,
              action: permission.action,
            }
          );
        }
      },
      500 // 500ms threshold
    );
  }

  /**
   * Get permissions by IDs with batch processing
   */
  static async getPermissionsByIds(
    permissionIds: string[]
  ): Promise<Permission[]> {
    if (permissionIds.length === 0) {
      return [];
    }

    return await measurePerformance(
      "RoleModel.getPermissionsByIds",
      async () => {
        try {
          // Use the batch processing utility for efficient fetching
          const permissions = await processBatch<string, Permission | null>(
            permissionIds,
            async (permId) => {
              const permDoc = await this.permissionsCollection
                .doc(permId)
                .get();
              return permDoc.exists ? (permDoc.data() as Permission) : null;
            },
            10 // Batch size of 10
          );

          // Filter out null values (permissions that don't exist)
          const validPermissions = permissions.filter(
            (p): p is Permission => p !== null
          );

          logger.debug({
            message: "Retrieved permissions by IDs",
            requestedCount: permissionIds.length,
            foundCount: validPermissions.length,
          });

          return validPermissions;
        } catch (error) {
          logger.error({
            message: "Error fetching permissions by IDs",
            permissionIds,
            error: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined,
          });

          throw new DatabaseError(
            "Failed to fetch permissions",
            "PERMISSIONS_FETCH_ERROR",
            { count: permissionIds.length }
          );
        }
      },
      Math.min(1000, permissionIds.length * 50) // Dynamic threshold based on number of IDs
    );
  }

  /**
   * Add permissions to a role
   */
  static async addPermissionsToRole(
    roleId: string,
    permissionIds: string[]
  ): Promise<void> {
    return await measurePerformance(
      "RoleModel.addPermissionsToRole",
      async () => {
        try {
          await runTransaction(async (transaction) => {
            // Get the role document
            const roleRef = this.rolesCollection.doc(roleId);
            const roleDoc = await transaction.get(roleRef);

            if (!roleDoc.exists) {
              throw new NotFoundError("Role not found", "ROLE_NOT_FOUND", {
                roleId,
              });
            }

            const role = roleDoc.data() as Role;

            // Create a set of existing permissions to avoid duplicates
            const existingPermissions = new Set(role.permissions);
            const newPermissions = permissionIds.filter(
              (id) => !existingPermissions.has(id)
            );

            // Update the role with the combined permissions
            if (newPermissions.length > 0) {
              transaction.update(roleRef, {
                permissions: [...role.permissions, ...newPermissions],
              });

              logger.info({
                message: "Permissions added to role",
                roleId,
                roleName: role.name,
                addedCount: newPermissions.length,
                totalCount: role.permissions.length + newPermissions.length,
              });
            } else {
              logger.debug({
                message: "No new permissions to add to role",
                roleId,
                roleName: role.name,
              });
            }
          });
        } catch (error) {
          // Re-throw NotFoundError
          if (error instanceof NotFoundError) {
            throw error;
          }

          logger.error({
            message: "Error adding permissions to role",
            roleId,
            permissionCount: permissionIds.length,
            error: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined,
          });

          throw new DatabaseError(
            "Failed to add permissions to role",
            "ROLE_PERMISSION_UPDATE_ERROR",
            { roleId }
          );
        }
      },
      1000 // 1000ms threshold
    );
  }

  /**
   * Remove permissions from a role
   */
  static async removePermissionsFromRole(
    roleId: string,
    permissionIds: string[]
  ): Promise<void> {
    return await measurePerformance(
      "RoleModel.removePermissionsFromRole",
      async () => {
        try {
          await runTransaction(async (transaction) => {
            // Get the role document
            const roleRef = this.rolesCollection.doc(roleId);
            const roleDoc = await transaction.get(roleRef);

            if (!roleDoc.exists) {
              throw new NotFoundError("Role not found", "ROLE_NOT_FOUND", {
                roleId,
              });
            }

            const role = roleDoc.data() as Role;

            // Create a set of permissions to remove for efficient lookups
            const permissionsToRemove = new Set(permissionIds);

            // Filter out the permissions to remove
            const updatedPermissions = role.permissions.filter(
              (id) => !permissionsToRemove.has(id)
            );

            // Update the role with the filtered permissions
            if (updatedPermissions.length !== role.permissions.length) {
              transaction.update(roleRef, {
                permissions: updatedPermissions,
              });

              logger.info({
                message: "Permissions removed from role",
                roleId,
                roleName: role.name,
                removedCount:
                  role.permissions.length - updatedPermissions.length,
                remainingCount: updatedPermissions.length,
              });
            } else {
              logger.debug({
                message: "No permissions were removed from role",
                roleId,
                roleName: role.name,
              });
            }
          });
        } catch (error) {
          // Re-throw NotFoundError
          if (error instanceof NotFoundError) {
            throw error;
          }

          logger.error({
            message: "Error removing permissions from role",
            roleId,
            permissionCount: permissionIds.length,
            error: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined,
          });

          throw new DatabaseError(
            "Failed to remove permissions from role",
            "ROLE_PERMISSION_UPDATE_ERROR",
            { roleId }
          );
        }
      },
      1000 // 1000ms threshold
    );
  }
}
