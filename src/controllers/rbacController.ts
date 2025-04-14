import { Request, Response } from "express";
import { RoleModel } from "@/models/Role";
import { logger } from "@/utils/logger";
import { AppError } from "@/utils/errors";

export const createRole = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { name, description, permissions = [] } = req.body;

    const newRole = await RoleModel.createRole({
      name,
      description,
      permissions,
    });

    res.status(201).json({
      message: "Role created successfully",
      role: newRole,
    });
  } catch (error) {
    logger.error({
      message: "Error creating role",
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      data: req.body,
    });

    // If it's our custom error, use its status code, otherwise use 500
    const statusCode = error instanceof AppError ? error.statusCode : 500;
    res.status(statusCode).json({
      error: "Failed to create role",
      message: error instanceof Error ? error.message : String(error),
    });
  }
};

export const getAllRoles = async (
  _req: Request,
  res: Response
): Promise<void> => {
  try {
    const roles = await RoleModel.getAllRoles();
    res.status(200).json({ roles });
  } catch (error) {
    logger.error({
      message: "Error fetching roles",
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });

    // If it's our custom error, use its status code, otherwise use 500
    const statusCode = error instanceof AppError ? error.statusCode : 500;
    res.status(statusCode).json({
      error: "Failed to fetch roles",
      message: error instanceof Error ? error.message : String(error),
    });
  }
};

export const createPermission = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { name, description, resource, action } = req.body;

    const newPermission = await RoleModel.createPermission({
      name,
      description,
      resource,
      action,
    });

    res.status(201).json({
      message: "Permission created successfully",
      permission: newPermission,
    });
  } catch (error) {
    logger.error({
      message: "Error creating permission",
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      data: req.body,
    });

    // If it's our custom error, use its status code, otherwise use 500
    const statusCode = error instanceof AppError ? error.statusCode : 500;
    res.status(statusCode).json({
      error: "Failed to create permission",
      message: error instanceof Error ? error.message : String(error),
    });
  }
};
