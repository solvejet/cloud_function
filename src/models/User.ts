import { db } from "../config/firebase";
import { AuthUser, UserRole } from "../types/auth";

export class User {
  // private static collection = db().collection("users");
  private static userRolesCollection = db().collection("userRoles");

  static async getUserById(userId: string): Promise<AuthUser | null> {
    try {
      const userRecord = await db().collection("users").doc(userId).get();

      if (!userRecord.exists) {
        return null;
      }

      return userRecord.data() as AuthUser;
    } catch (error) {
      console.error("Error fetching user:", error);
      throw error;
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

      // Update custom claims for Firebase Auth
      // const auth = getAuth();
      // await auth.setCustomUserClaims(userId, { roles: roleIds });
    } catch (error) {
      console.error("Error assigning roles to user:", error);
      throw error;
    }
  }

  static async getUserRoles(userId: string): Promise<UserRole | null> {
    try {
      const userRolesDoc = await User.userRolesCollection.doc(userId).get();

      if (!userRolesDoc.exists) {
        return null;
      }

      return userRolesDoc.data() as UserRole;
    } catch (error) {
      console.error("Error fetching user roles:", error);
      throw error;
    }
  }
}
