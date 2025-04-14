import { body } from "express-validator";
import { validateRequest } from "./validationUtils";

export const validateCreateRole = [
  body("name")
    .isString()
    .isLength({ min: 2, max: 50 })
    .withMessage("Role name must be between 2 and 50 characters"),
  body("description")
    .isString()
    .isLength({ min: 2, max: 200 })
    .withMessage("Description must be between 2 and 200 characters"),
  body("permissions")
    .isArray()
    .withMessage("permissions must be an array of permission IDs"),
  validateRequest, // Use the utility function for validation
];

export const validateCreatePermission = [
  body("name")
    .isString()
    .isLength({ min: 2, max: 50 })
    .withMessage("Permission name must be between 2 and 50 characters"),
  body("description")
    .isString()
    .isLength({ min: 2, max: 200 })
    .withMessage("Description must be between 2 and 200 characters"),
  body("resource")
    .isString()
    .isLength({ min: 1, max: 50 })
    .withMessage("Resource must be specified"),
  body("action")
    .isIn(["create", "read", "update", "delete", "manage"])
    .withMessage("Action must be one of: create, read, update, delete, manage"),
  validateRequest, // Use the utility function for validation
];
