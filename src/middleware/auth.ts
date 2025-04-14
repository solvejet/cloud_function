import { Request, Response, NextFunction } from "express";
import * as admin from "firebase-admin";
import { auth } from "@/config/firebase";
import { User } from "@/models/User";
import { RoleModel } from "@/models/Role";
import { Permission } from "@/types/auth";
import {
  UnauthorizedError,
  ForbiddenError,
  InternalServerError,
  NotFoundError,
  BadRequestError,
} from "@/utils/errors";
import { logger } from "@/utils/logger";

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
  _res: Response,
  next: NextFunction
): Promise<void> => {
  const requestId = req.headers["x-request-id"] as string;
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    logger.warn({
      message: "No authentication token provided",
      requestId,
      path: req.path,
    });
    next(new UnauthorizedError("No token provided", "NO_TOKEN_PROVIDED"));
    return;
  }

  const token = authHeader.split("Bearer ")[1];

  try {
    if (!token) {
      throw new Error("Token is undefined");
    }

    const decodedToken = await auth().verifyIdToken(token);
    req.user = decodedToken;

    logger.debug({
      message: "Token verified successfully",
      requestId,
      userId: decodedToken.uid,
    });

    next();
  } catch (error) {
    logger.warn({
      message: "Invalid authentication token",
      requestId,
      path: req.path,
      error: error instanceof Error ? error.message : String(error),
    });

    next(new UnauthorizedError("Invalid token", "INVALID_TOKEN"));
  }
};

// Middleware to load user permissions
export const loadPermissions = async (
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> => {
  const requestId = req.headers["x-request-id"] as string;

  if (!req.user) {
    logger.warn({
      message: "User not authenticated",
      requestId,
      path: req.path,
    });
    next(
      new UnauthorizedError("User not authenticated", "USER_NOT_AUTHENTICATED")
    );
    return;
  }

  try {
    // Get user roles
    const userRoles = await User.getUserRoles(req.user.uid);

    if (!userRoles) {
      logger.debug({
        message: "No roles found for user",
        requestId,
        userId: req.user.uid,
      });
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

    logger.debug({
      message: "User roles loaded",
      requestId,
      userId: req.user.uid,
      roleCount: validRoles.length,
      roleIds: validRoles.map((role) => role.id),
    });

    // Collect all permission IDs from all roles
    const permissionIds = Array.from(
      new Set(validRoles.flatMap((role) => role.permissions))
    );

    // Get all permissions data
    req.permissions = await RoleModel.getPermissionsByIds(permissionIds);

    logger.debug({
      message: "User permissions loaded",
      requestId,
      userId: req.user.uid,
      permissionCount: req.permissions.length,
      permissionResources: Array.from(
        new Set(req.permissions.map((p) => p.resource))
      ),
    });

    next();
  } catch (error) {
    logger.error({
      message: "Error loading user permissions",
      requestId,
      userId: req.user.uid,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });

    next(
      new InternalServerError(
        "Failed to load permissions",
        "PERMISSION_LOADING_ERROR",
        {
          userId: req.user.uid,
        }
      )
    );
  }
};

// Helper middleware to check if user has specific permission
export const hasPermission = (
  resource: string,
  action: Permission["action"]
) => {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const requestId = req.headers["x-request-id"] as string;

    if (!req.permissions) {
      logger.warn({
        message: "Permissions not loaded",
        requestId,
        path: req.path,
        resource,
        action,
      });
      next(
        new ForbiddenError("Permissions not loaded", "PERMISSIONS_NOT_LOADED")
      );
      return;
    }

    const hasRequiredPermission = req.permissions.some(
      (perm) =>
        (perm.resource === resource && perm.action === action) ||
        (perm.resource === resource && perm.action === "manage") ||
        (perm.resource === "*" && perm.action === "manage")
    );

    if (!hasRequiredPermission) {
      logger.warn({
        message: "Insufficient permissions",
        requestId,
        userId: req.user?.uid,
        path: req.path,
        requiredResource: resource,
        requiredAction: action,
        userPermissions: req.permissions.map(
          (p) => `${p.resource}:${p.action}`
        ),
      });

      next(
        new ForbiddenError(
          "Insufficient permissions",
          "INSUFFICIENT_PERMISSIONS",
          {
            requiredPermission: `${resource}:${action}`,
          }
        )
      );
      return;
    }

    logger.debug({
      message: "Permission check passed",
      requestId,
      userId: req.user?.uid,
      resource,
      action,
    });

    next();
  };
};

// Helper middleware to check resource ownership
export const isResourceOwner = (
  resourceIdParam: string,
  lookupFunction: (id: string) => Promise<{ ownerId: string } | null>
) => {
  return async (
    req: Request,
    _res: Response,
    next: NextFunction
  ): Promise<void> => {
    const requestId = req.headers["x-request-id"] as string;
    const resourceId = req.params[resourceIdParam];

    if (!req.user) {
      logger.warn({
        message: "User not authenticated in ownership check",
        requestId,
        path: req.path,
      });
      next(
        new UnauthorizedError(
          "User not authenticated",
          "USER_NOT_AUTHENTICATED"
        )
      );
      return;
    }

    // Check if resourceId exists
    if (!resourceId) {
      logger.warn({
        message: "Resource ID is missing",
        requestId,
        path: req.path,
        resourceParam: resourceIdParam,
      });
      next(
        new BadRequestError("Resource ID is required", "MISSING_RESOURCE_ID")
      );
      return;
    }

    try {
      const resource = await lookupFunction(resourceId);

      if (!resource) {
        logger.warn({
          message: "Resource not found in ownership check",
          requestId,
          resourceId,
          resourceParam: resourceIdParam,
        });
        next(new NotFoundError("Resource not found", "RESOURCE_NOT_FOUND"));
        return;
      }

      if (resource.ownerId === req.user.uid) {
        logger.debug({
          message: "Resource ownership verified",
          requestId,
          userId: req.user.uid,
          resourceId,
        });
        next();
      } else {
        logger.warn({
          message: "Resource ownership check failed",
          requestId,
          userId: req.user.uid,
          resourceId,
          ownerId: resource.ownerId,
        });
        next(
          new ForbiddenError(
            "Not authorized to access this resource",
            "NOT_RESOURCE_OWNER"
          )
        );
      }
    } catch (error) {
      logger.error({
        message: "Error checking resource ownership",
        requestId,
        userId: req.user.uid,
        resourceId,
        error: error instanceof Error ? error.message : String(error),
      });
      next(
        new InternalServerError(
          "Failed to verify resource ownership",
          "OWNERSHIP_CHECK_ERROR"
        )
      );
    }
  };
};
