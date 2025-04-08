import { Request, Response, NextFunction } from "express";
import * as admin from "firebase-admin";
import { auth } from "../config/firebase";
import { User } from "../models/User";
import { RoleModel } from "../models/Role";
import { Permission } from "../types/auth";

// Extend Express Request interface to include user property
declare global {
  namespace Express {
    interface Request {
      user?: admin.auth.DecodedIdToken;
      permissions?: Permission[];
    }
  }
}

// Middleware to verify Firebase ID token
export const verifyToken = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({ error: "Unauthorized: No token provided" });
    return;
  }

  const token = authHeader.split("Bearer ")[1];

  try {
    if (!token) {
      throw new Error("Token is undefined");
    }
    const decodedToken = await auth().verifyIdToken(token);
    req.user = decodedToken;
    next();
  } catch (error) {
    console.error("Error verifying token:", error);
    res.status(401).json({ error: "Unauthorized: Invalid token" });
  }
};

// Middleware to load user permissions
export const loadPermissions = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  if (!req.user) {
    res.status(401).json({ error: "Unauthorized: User not authenticated" });
    return;
  }

  try {
    // Get user roles
    const userRoles = await User.getUserRoles(req.user.uid);

    if (!userRoles) {
      req.permissions = [];
      next();
      return;
    }

    // Get all roles data
    const rolePromises = userRoles.roleIds.map((roleId) =>
      RoleModel.getRoleById(roleId)
    );
    const roles = await Promise.all(rolePromises);
    const validRoles = roles.filter(
      (role): role is NonNullable<typeof role> => role !== null
    );

    // Collect all permission IDs from all roles
    const permissionIds = Array.from(
      new Set(validRoles.flatMap((role) => role.permissions))
    );

    // Get all permissions data
    req.permissions = await RoleModel.getPermissionsByIds(permissionIds);
    next();
  } catch (error) {
    console.error("Error loading permissions:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

// Helper middleware to check if user has specific permission
export const hasPermission = (
  resource: string,
  action: Permission["action"]
) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.permissions) {
      res.status(403).json({ error: "Forbidden: Permissions not loaded" });
      return;
    }

    const hasRequiredPermission = req.permissions.some(
      (perm) =>
        (perm.resource === resource && perm.action === action) ||
        (perm.resource === resource && perm.action === "manage") ||
        (perm.resource === "*" && perm.action === "manage")
    );

    if (!hasRequiredPermission) {
      res.status(403).json({ error: "Forbidden: Insufficient permissions" });
      return;
    }

    next();
  };
};
