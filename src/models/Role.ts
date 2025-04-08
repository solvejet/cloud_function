import { db } from "../config/firebase";
import { Role, Permission } from "../types/auth";

export class RoleModel {
  private static rolesCollection = db().collection("roles");
  private static permissionsCollection = db().collection("permissions");

  static async createRole(role: Omit<Role, "id">): Promise<Role> {
    try {
      const roleRef = this.rolesCollection.doc();
      const roleWithId = { ...role, id: roleRef.id };
      await roleRef.set(roleWithId);
      return roleWithId;
    } catch (error) {
      console.error("Error creating role:", error);
      throw error;
    }
  }

  static async getRoleById(roleId: string): Promise<Role | null> {
    try {
      const roleDoc = await this.rolesCollection.doc(roleId).get();

      if (!roleDoc.exists) {
        return null;
      }

      return roleDoc.data() as Role;
    } catch (error) {
      console.error("Error fetching role:", error);
      throw error;
    }
  }

  static async getAllRoles(): Promise<Role[]> {
    try {
      const rolesSnapshot = await this.rolesCollection.get();
      return rolesSnapshot.docs.map((doc) => doc.data() as Role);
    } catch (error) {
      console.error("Error fetching all roles:", error);
      throw error;
    }
  }

  static async createPermission(
    permission: Omit<Permission, "id">
  ): Promise<Permission> {
    try {
      const permissionRef = this.permissionsCollection.doc();
      const permissionWithId = { ...permission, id: permissionRef.id };
      await permissionRef.set(permissionWithId);
      return permissionWithId;
    } catch (error) {
      console.error("Error creating permission:", error);
      throw error;
    }
  }

  static async getPermissionsByIds(
    permissionIds: string[]
  ): Promise<Permission[]> {
    try {
      const permissions: Permission[] = [];

      for (const permId of permissionIds) {
        const permDoc = await this.permissionsCollection.doc(permId).get();
        if (permDoc.exists) {
          permissions.push(permDoc.data() as Permission);
        }
      }

      return permissions;
    } catch (error) {
      console.error("Error fetching permissions:", error);
      throw error;
    }
  }
}
