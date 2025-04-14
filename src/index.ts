import express, { Request, Response } from "express";
import cors from "cors";
import helmet from "helmet";
import path from "path";
import fs from "fs";
import userRoutes from "./routes/userRoutes";
import rbacRoutes from "./routes/rbacRoutes";
import authRoutes from "./routes/authRoutes"; // Add auth routes
import { errorHandler, notFoundHandler } from "./middleware/errorHandler";
import { requestIdMiddleware, httpLogger } from "./middleware/requestLogger";
import { logger } from "./utils/logger";
import { initializeFirebase } from "./config/firebase";
import { cleanupExpiredTokens } from "./utils/security"; // Add token cleanup

// Ensure logs directory exists
const logsDir = path.join(process.cwd(), "logs");
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Log application startup
logger.info(
  `Starting application in ${process.env.NODE_ENV || "development"} mode`
);

// Initialize Firebase
async function startServer(): Promise<void> {
  try {
    await initializeFirebase();
    logger.info("Firebase initialized successfully");

    // Create Express app
    const app = express();
    const PORT = process.env.PORT || 8080;

    // Basic Middleware
    app.use(helmet());
    app.use(cors());
    app.use(express.json());

    // Logging Middleware
    app.use(requestIdMiddleware);
    app.use(httpLogger);

    // Routes
    app.use("/api/auth", authRoutes); // Add authentication routes
    app.use("/api/users", userRoutes);
    app.use("/api/rbac", rbacRoutes);

    // Health check
    app.get("/health", (_req: Request, res: Response) => {
      res.status(200).json({
        status: "ok",
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
      });
    });

    // 404 handler
    app.use(notFoundHandler);

    // Error handler
    app.use(errorHandler);

    // Start the server
    app.listen(PORT, () => {
      logger.info(`Server running on port ${PORT}`);
    });

    // Schedule token cleanup job (run every hour)
    setInterval(async () => {
      await cleanupExpiredTokens();
    }, 60 * 60 * 1000);
  } catch (error) {
    logger.error({
      message: "Failed to start the server",
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    process.exit(1);
  }
}

// Start the server
startServer();

// Handle uncaught exceptions
process.on("uncaughtException", (error) => {
  logger.error({
    message: "Uncaught exception",
    error: error.message,
    stack: error.stack,
  });

  // Exit with error
  process.exit(1);
});

// Handle unhandled promise rejections
process.on("unhandledRejection", (reason) => {
  logger.error({
    message: "Unhandled promise rejection",
    reason: reason instanceof Error ? reason.message : String(reason),
    stack: reason instanceof Error ? reason.stack : undefined,
  });
});

// Graceful shutdown
const gracefulShutdown = (signal: string): void => {
  logger.info(`${signal} signal received. Starting graceful shutdown...`);

  // Close server and other connections
  setTimeout(() => {
    logger.info("Graceful shutdown completed.");
    process.exit(0);
  }, 1000);
};

// Listen for termination signals
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));

// For testing purposes
export { errorHandler, notFoundHandler };
