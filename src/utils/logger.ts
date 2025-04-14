import winston from "winston";

// Define log levels
const levels = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  debug: 4,
};

// Determine log level based on environment
const level = (): string => {
  const env = process.env.NODE_ENV || "development";
  return env === "development" ? "debug" : "http";
};

// Define custom formats
const formats = {
  // Format for local development (colorized, simple)
  development: winston.format.combine(
    winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
    winston.format.colorize({ all: true }),
    winston.format.printf((info) => {
      const { timestamp, level, message, ...rest } = info;
      const restString = Object.keys(rest).length
        ? `\n${JSON.stringify(rest, null, 2)}`
        : "";
      return `${timestamp} [${level}]: ${message}${restString}`;
    })
  ),

  // Format for production (JSON for log processing systems)
  production: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
};

// Choose format based on environment
const format =
  process.env.NODE_ENV === "production"
    ? formats.production
    : formats.development;

// Define transports
const transports = [
  // Always log to console
  new winston.transports.Console(),

  // Log errors to separate file
  new winston.transports.File({
    filename: "logs/error.log",
    level: "error",
    maxsize: 10485760, // 10MB
    maxFiles: 5,
  }),

  // Log all to combined file
  new winston.transports.File({
    filename: "logs/combined.log",
    maxsize: 10485760, // 10MB
    maxFiles: 5,
  }),
];

// Extend the Winston Logger interface to include log levels as direct methods
interface CustomLogger extends winston.Logger {
  error: winston.LeveledLogMethod;
  warn: winston.LeveledLogMethod;
  info: winston.LeveledLogMethod;
  http: winston.LeveledLogMethod;
  debug: winston.LeveledLogMethod;
}

// Create Winston logger instance
export const logger: CustomLogger = winston.createLogger({
  level: level(),
  levels,
  format,
  transports,
  exitOnError: false, // Don't exit on handled exceptions
}) as CustomLogger;

// Add stream for Morgan HTTP request logging
export const morganStream = {
  write: (message: string): void => {
    logger.http(message.trim());
  },
};

// Export default logger configuration
export default logger;
