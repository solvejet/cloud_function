import { Router } from "express";
import {
  createUser,
  getUserDetails,
  updateUserRoles,
} from "../controllers/userController";
import {
  verifyToken,
  loadPermissions,
  hasPermission,
} from "../middleware/auth";
import {
  validateCreateUser,
  validateUpdateUserRoles,
} from "../middleware/validation/userValidation";

const router = Router();

// Create new user (admin only)
router.post(
  "/",
  verifyToken,
  loadPermissions,
  hasPermission("users", "create"),
  validateCreateUser,
  createUser
);

// Get user details (self or admin)
router.get(
  "/:id",
  verifyToken,
  loadPermissions,
  (req, res, next) => {
    // Allow users to get their own details
    if (req.user?.uid === req.params.id) {
      return next();
    }
    // Otherwise, check if they have permission
    return hasPermission("users", "read")(req, res, next);
  },
  getUserDetails
);

// Update user roles (admin only)
router.put(
  "/:id/roles",
  verifyToken,
  loadPermissions,
  hasPermission("users", "update"),
  validateUpdateUserRoles,
  updateUserRoles
);

export default router;
