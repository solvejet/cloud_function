import { body } from "express-validator";
import { validateRequest } from "./validationUtils";

export const validateLogin = [
  body("email")
    .isEmail()
    .withMessage("Must be a valid email address")
    .normalizeEmail()
    .trim(),
  body("password")
    .isLength({ min: 8 })
    .withMessage("Password must be at least 8 characters long"),
  validateRequest, // Use the utility function for validation
];

export const validateRefreshToken = [
  body("refreshToken")
    .isString()
    .withMessage("Refresh token must be a string")
    .notEmpty()
    .withMessage("Refresh token is required"),
  validateRequest,
];

export const validateLogout = [
  body("refreshToken")
    .optional()
    .isString()
    .withMessage("Refresh token must be a string"),
  body("allDevices")
    .optional()
    .isBoolean()
    .withMessage("allDevices must be a boolean value"),
  validateRequest,
];
