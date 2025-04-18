import { body, param } from "express-validator";
import { validateRequest } from "./validationUtils";

export const validateCreateUser = [
  body("email").isEmail().withMessage("Must be a valid email address"),
  body("password")
    .isLength({ min: 8 })
    .withMessage("Password must be at least 8 characters long")
    .matches(/[A-Z]/)
    .withMessage("Password must contain at least one uppercase letter")
    .matches(/[a-z]/)
    .withMessage("Password must contain at least one lowercase letter")
    .matches(/[0-9]/)
    .withMessage("Password must contain at least one number")
    .matches(/[!@#$%^&*(),.?":{}|<>]/)
    .withMessage("Password must contain at least one special character"),
  body("displayName")
    .optional()
    .isLength({ min: 2, max: 100 })
    .withMessage("Display name must be between 2 and 100 characters"),
  body("roleIds").optional().isArray().withMessage("roleIds must be an array"),
  validateRequest, // Use the utility function for validation
];

export const validateUpdateUserRoles = [
  param("id").isString().withMessage("User ID must be a string"),
  body("roleIds").isArray().withMessage("roleIds must be an array"),
  validateRequest, // Use the utility function for validation
];
