import { Router } from "express";
import {
  createRole,
  getAllRoles,
  createPermission,
} from "@/controllers/rbacController";
import { verifyToken, loadPermissions, hasPermission } from "@/middleware/auth";
import {
  validateCreateRole,
  validateCreatePermission,
} from "@/middleware/validation/rbacValidation";

const router: Router = Router();

// Role routes
router.post(
  "/roles",
  verifyToken,
  loadPermissions,
  hasPermission("roles", "create"),
  validateCreateRole,
  createRole
);

router.get(
  "/roles",
  verifyToken,
  loadPermissions,
  hasPermission("roles", "read"),
  getAllRoles
);

// Permission routes
router.post(
  "/permissions",
  verifyToken,
  loadPermissions,
  hasPermission("permissions", "create"),
  validateCreatePermission,
  createPermission
);

export default router;
