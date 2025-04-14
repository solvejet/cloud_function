import { Request, Response, NextFunction } from "express";
import morgan from "morgan";
import { v4 as uuidv4 } from "uuid";
import { logger, morganStream } from "@/utils/logger";

/**
 * Generate a unique request ID and attach it to the request
 */
export const requestIdMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  // Use existing request ID from headers if available, otherwise generate a new one
  const requestId =
    (req.headers["x-request-id"] as string) ||
    (req.headers["x-correlation-id"] as string) ||
    uuidv4();

  // Attach to request object and include in response headers
  req.headers["x-request-id"] = requestId;
  res.setHeader("x-request-id", requestId);

  next();
};

/**
 * Custom Morgan format that includes the request ID
 */
const customFormat = (tokens: any, req: Request, res: Response): string => {
  return [
    tokens.method(req, res),
    tokens.url(req, res),
    tokens.status(req, res),
    tokens.res(req, res, "content-length"),
    "-",
    tokens["response-time"](req, res),
    "ms",
    `requestId=${req.headers["x-request-id"] as string}`,
  ].join(" ");
};

/**
 * Configure Morgan HTTP request logger
 */
export const httpLogger = morgan(
  (tokens, req, res) => customFormat(tokens, req as Request, res as Response),
  { stream: morganStream }
);

/**
 * Advanced request logging with more details (for specific routes or debugging)
 */
export const detailedRequestLogger = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  // Get request start time
  const startTime = new Date().getTime();

  // Log request details
  logger.info({
    message: `Request started: ${req.method} ${req.path}`,
    requestId: req.headers["x-request-id"] as string,
    method: req.method,
    path: req.originalUrl,
    query: req.query,
    headers: {
      "user-agent": req.headers["user-agent"],
      "content-type": req.headers["content-type"],
      accept: req.headers["accept"],
    },
    ip: req.ip,
  });

  // Log response details when finished
  res.on("finish", () => {
    const responseTime = new Date().getTime() - startTime;

    // Determine log level based on status code
    const logMethod =
      res.statusCode >= 500 ? "error" : res.statusCode >= 400 ? "warn" : "info";

    logger[logMethod]({
      message: `Request completed: ${req.method} ${req.path}`,
      requestId: req.headers["x-request-id"] as string,
      method: req.method,
      path: req.originalUrl,
      statusCode: res.statusCode,
      responseTime: `${responseTime}ms`,
    });
  });

  next();
};
