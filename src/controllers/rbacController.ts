import { Request, Response } from "express";
import { RoleModel } from "../models/Role";

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
    console.error("Error creating role:", error);
    res.status(500).json({ error: "Failed to create role" });
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
    console.error("Error fetching roles:", error);
    res.status(500).json({ error: "Failed to fetch roles" });
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
    console.error("Error creating permission:", error);
    res.status(500).json({ error: "Failed to create permission" });
  }
};
