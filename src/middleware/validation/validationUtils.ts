// src/middleware/validation/validationUtils.ts
import { Request, Response, NextFunction } from "express";
import { validationResult } from "express-validator";
import { ValidationError } from "@/utils/errors";
import { logger } from "@/utils/logger";

/**
 * Helper function to check validation results and handle errors
 * Promotes code reuse across validation files
 */
export const validateRequest = (
  req: Request,
  _res: Response,
  next: NextFunction
): void => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const requestId = req.headers["x-request-id"] as string;

    // Add detailed logging
    logger.warn({
      message: "Validation failed",
      requestId,
      path: req.path,
      method: req.method,
      validationErrors: errors.array(),
    });

    // Pass to the error handler with all validation details
    next(
      new ValidationError("Validation failed", "VALIDATION_ERROR", {
        validation: errors.array().map((err) => ({
          param: err.type === "field" ? err.path : err.type,
          msg: err.msg,
          location: err.type === "field" ? err.location : undefined,
          value: err.type === "field" ? err.value : undefined,
        })),
      })
    );
  } else {
    next();
  }
};
