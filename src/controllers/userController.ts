import { Request, Response } from "express";
import { auth } from "@/config/firebase";
import { User } from "@/models/User";
import { logger } from "@/utils/logger";
import { AppError } from "@/utils/errors";

export const createUser = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { email, password, displayName, roleIds = [] } = req.body;

    // Create user in Firebase Auth
    const userRecord = await auth().createUser({
      email,
      password,
      displayName,
      emailVerified: false,
    });

    // Assign roles if provided
    if (roleIds.length > 0) {
      await User.assignRolesToUser(userRecord.uid, roleIds);
    }

    res.status(201).json({
      message: "User created successfully",
      userId: userRecord.uid,
    });
  } catch (error) {
    logger.error({
      message: "Error creating user",
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      data: { email: req.body.email, displayName: req.body.displayName },
    });

    // If it's our custom error, use its status code, otherwise use 500
    const statusCode = error instanceof AppError ? error.statusCode : 500;
    res.status(statusCode).json({
      error: "Failed to create user",
      message: error instanceof Error ? error.message : String(error),
    });
  }
};

export const getUserDetails = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const userId = req.params.id;

    if (!userId) {
      res.status(400).json({ error: "User ID is required" });
      return;
    }
    const userRecord = await auth().getUser(userId);
    const userRoles = await User.getUserRoles(userId);

    res.status(200).json({
      user: {
        uid: userRecord.uid,
        email: userRecord.email,
        displayName: userRecord.displayName,
        emailVerified: userRecord.emailVerified,
        disabled: userRecord.disabled,
        metadata: userRecord.metadata,
      },
      roles: userRoles?.roleIds || [],
    });
  } catch (error) {
    logger.error({
      message: "Error fetching user details",
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      userId: req.params.id,
    });

    // If it's our custom error, use its status code, otherwise use 500
    const statusCode = error instanceof AppError ? error.statusCode : 500;
    res.status(statusCode).json({
      error: "Failed to fetch user details",
      message: error instanceof Error ? error.message : String(error),
    });
  }
};

export const updateUserRoles = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const userId = req.params.id;
    const { roleIds } = req.body;

    // Verify user exists
    if (!userId) {
      throw new Error("User ID is required");
    }
    await auth().getUser(userId);

    // Update roles
    await User.assignRolesToUser(userId, roleIds);

    res.status(200).json({
      message: "User roles updated successfully",
    });
  } catch (error) {
    logger.error({
      message: "Error updating user roles",
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      userId: req.params.id,
      roleIds: req.body.roleIds,
    });

    // If it's our custom error, use its status code, otherwise use 500
    const statusCode = error instanceof AppError ? error.statusCode : 500;
    res.status(statusCode).json({
      error: "Failed to update user roles",
      message: error instanceof Error ? error.message : String(error),
    });
  }
};
