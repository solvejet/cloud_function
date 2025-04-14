import { Router } from "express";
import { login, logout, refreshToken } from "@/controllers/authController";
import { verifyToken } from "@/middleware/auth";
import {
  validateLogin,
  validateRefreshToken,
  validateLogout,
} from "@/middleware/validation/authValidation";
import { authLimiter } from "@/middleware/rateLimiter";

const router: Router = Router();

// Login route (with rate limiting)
router.post(
  "/login",
  authLimiter, // Apply strict rate limiting to prevent brute force
  validateLogin,
  login
);

// Token refresh route
router.post("/refresh-token", validateRefreshToken, refreshToken);

// Logout route (requires authentication)
router.post(
  "/logout",
  verifyToken, // Ensure user is authenticated
  validateLogout,
  logout
);

export default router;
