import { db } from "@/config/firebase";
import { AuthUser, UserRole } from "@/types/auth";
import { logger } from "@/utils/logger";
import { DatabaseError } from "@/utils/errors";

export class User {
  private static usersCollection = db().collection("users");
  private static userRolesCollection = db().collection("userRoles");

  static async getUserById(userId: string): Promise<AuthUser | null> {
    try {
      const userRecord = await this.usersCollection.doc(userId).get();

      if (!userRecord.exists) {
        logger.debug({
          message: "User not found",
          userId,
        });
        return null;
      }

      return userRecord.data() as AuthUser;
    } catch (error) {
      logger.error({
        message: "Error fetching user",
        userId,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });

      throw new DatabaseError("Failed to fetch user", "USER_FETCH_ERROR", {
        userId,
      });
    }
  }

  static async assignRolesToUser(
    userId: string,
    roleIds: string[]
  ): Promise<void> {
    try {
      await User.userRolesCollection.doc(userId).set({
        userId,
        roleIds,
      });

      logger.info({
        message: "Roles assigned to user",
        userId,
        roleCount: roleIds.length,
        roleIds,
      });

      // Update custom claims for Firebase Auth - this is commented out but now has proper comment
      // For future implementation:
      // const auth = getAuth();
      // await auth.setCustomUserClaims(userId, { roles: roleIds });
    } catch (error) {
      logger.error({
        message: "Error assigning roles to user",
        userId,
        roleIds,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });

      throw new DatabaseError(
        "Failed to assign roles to user",
        "ROLE_ASSIGNMENT_ERROR",
        { userId, roleCount: roleIds.length }
      );
    }
  }

  static async getUserRoles(userId: string): Promise<UserRole | null> {
    try {
      const userRolesDoc = await User.userRolesCollection.doc(userId).get();

      if (!userRolesDoc.exists) {
        logger.debug({
          message: "No roles found for user",
          userId,
        });
        return null;
      }

      return userRolesDoc.data() as UserRole;
    } catch (error) {
      logger.error({
        message: "Error fetching user roles",
        userId,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });

      throw new DatabaseError(
        "Failed to fetch user roles",
        "USER_ROLES_FETCH_ERROR",
        { userId }
      );
    }
  }
}
