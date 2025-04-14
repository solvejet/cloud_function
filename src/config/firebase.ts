import admin from "firebase-admin";
import { applicationDefault, getApps } from "firebase-admin/app";
import {
  getFirestore,
  initializeFirestore,
  Settings as FirestoreSettings,
} from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
import { logger } from "@/utils/logger";
import { ExternalServiceError, DatabaseError } from "@/utils/errors";
import { SecretManagerServiceClient } from "@google-cloud/secret-manager";

// Improved Firestore settings for better performance
const firestoreSettings: FirestoreSettings = {
  ignoreUndefinedProperties: true,
  preferRest: true, // Use REST API for better performance in GCP
};

/**
 * Load credentials from environment variables
 * @returns Firebase service account credentials
 */
async function loadCredentialsFromEnv(): Promise<admin.credential.Credential> {
  try {
    if (!process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
      throw new Error(
        "FIREBASE_SERVICE_ACCOUNT_KEY environment variable is not set"
      );
    }

    const serviceAccountJson = JSON.parse(
      process.env.FIREBASE_SERVICE_ACCOUNT_KEY
    );

    // Validate the service account format
    if (!serviceAccountJson.project_id || !serviceAccountJson.private_key) {
      throw new Error("Invalid service account format");
    }

    logger.info({
      message:
        "Successfully loaded Firebase credentials from environment variable",
      projectId: serviceAccountJson.project_id,
    });

    return admin.credential.cert(serviceAccountJson);
  } catch (error) {
    logger.error({
      message: "Failed to load Firebase credentials from environment variable",
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    throw new ExternalServiceError(
      "Failed to load Firebase credentials from environment",
      "ENV_CREDENTIALS_ERROR",
      { source: "environment" }
    );
  }
}

/**
 * Load credentials from Google Cloud Secret Manager
 * @returns Firebase service account credentials
 */
async function loadCredentialsFromSecretManager(): Promise<admin.credential.Credential> {
  try {
    if (!process.env.FIREBASE_SERVICE_ACCOUNT_SECRET) {
      throw new Error(
        "FIREBASE_SERVICE_ACCOUNT_SECRET environment variable is not set"
      );
    }

    const secretName = process.env.FIREBASE_SERVICE_ACCOUNT_SECRET;
    const client = new SecretManagerServiceClient();

    // Request the latest version of the secret
    const [version] = await client.accessSecretVersion({
      name: secretName,
    });

    if (!version.payload || !version.payload.data) {
      throw new Error("Secret payload is empty or undefined");
    }

    const secretValue = version.payload.data.toString();
    if (!secretValue) {
      throw new Error("Secret value is empty");
    }

    const serviceAccountJson = JSON.parse(secretValue);

    // Validate the service account format
    if (!serviceAccountJson.project_id || !serviceAccountJson.private_key) {
      throw new Error("Invalid service account format in Secret Manager");
    }

    logger.info({
      message: "Successfully loaded Firebase credentials from Secret Manager",
      projectId: serviceAccountJson.project_id,
      secretName,
    });

    return admin.credential.cert(serviceAccountJson);
  } catch (error) {
    logger.error({
      message: "Failed to load Firebase credentials from Secret Manager",
      secretName: process.env.FIREBASE_SERVICE_ACCOUNT_SECRET,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    throw new ExternalServiceError(
      "Failed to load Firebase credentials from Secret Manager",
      "SECRET_MANAGER_ERROR",
      {
        source: "secretManager",
        secretName: process.env.FIREBASE_SERVICE_ACCOUNT_SECRET,
      }
    );
  }
}

/**
 * Load credentials using application default credentials
 * @returns Firebase default application credentials
 */
function loadDefaultCredentials(): admin.credential.Credential {
  try {
    logger.info("Using application default credentials for Firebase");
    return applicationDefault();
  } catch (error) {
    logger.error({
      message: "Failed to load application default credentials",
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    throw new ExternalServiceError(
      "Failed to load application default credentials",
      "DEFAULT_CREDENTIALS_ERROR",
      { source: "applicationDefault" }
    );
  }
}

/**
 * Load Firebase credentials based on available sources
 * Priority: 1. Environment Variable, 2. Secret Manager, 3. Default Credentials
 * @returns Firebase credentials
 */
async function loadSecrets(): Promise<admin.credential.Credential> {
  // Using a more structured approach with better error handling
  try {
    // Check for environment variable first (highest priority)
    if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
      return await loadCredentialsFromEnv();
    }

    // Try Secret Manager next
    if (process.env.FIREBASE_SERVICE_ACCOUNT_SECRET) {
      return await loadCredentialsFromSecretManager();
    }

    // Fall back to default credentials
    return loadDefaultCredentials();
  } catch (error) {
    // This catches any errors from the credential loading functions
    // and wraps them in a more specific error
    logger.error({
      message: "All credential loading methods failed",
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });

    throw new ExternalServiceError(
      "Failed to load Firebase credentials from any source",
      "CREDENTIALS_UNAVAILABLE",
      {
        attempted: [
          !!process.env.FIREBASE_SERVICE_ACCOUNT_KEY ? "environment" : null,
          !!process.env.FIREBASE_SERVICE_ACCOUNT_SECRET
            ? "secretManager"
            : null,
          "defaultCredentials",
        ].filter(Boolean),
      }
    );
  }
}

// Initialize Firebase function
export const initializeFirebase = async (): Promise<admin.app.App> => {
  try {
    // Use singleton pattern for Firebase initialization
    if (getApps().length === 0) {
      // Get credentials based on environment
      const credential = await loadSecrets();

      // Get project ID from environment or credentials
      const projectId =
        process.env.FIREBASE_PROJECT_ID ||
        process.env.GCP_PROJECT_ID ||
        "default-project";

      // Initialize with configured credentials
      const app = admin.initializeApp({
        credential,
        projectId,
      });

      // Initialize Firestore with optimized settings
      initializeFirestore(admin.app(), firestoreSettings);

      logger.info({
        message: "Firebase initialized successfully",
        projectId: app.options.projectId || "unknown",
      });

      return app;
    }

    return admin.app();
  } catch (error) {
    logger.error({
      message: "Fatal error initializing Firebase",
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });

    throw new ExternalServiceError(
      "Firebase initialization failed. Check your credentials and permissions.",
      "FIREBASE_INIT_ERROR",
      {
        originalError: error instanceof Error ? error.message : String(error),
      }
    );
  }
};

// Get Firestore instance with enhanced error handling
export const db = (): admin.firestore.Firestore => {
  try {
    return getFirestore();
  } catch (error) {
    logger.error({
      message: "Error getting Firestore instance",
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });

    throw new ExternalServiceError(
      "Failed to get Firestore instance",
      "FIRESTORE_INSTANCE_ERROR"
    );
  }
};

// Get Auth instance with enhanced error handling
export const auth = (): admin.auth.Auth => {
  try {
    return getAuth();
  } catch (error) {
    logger.error({
      message: "Error getting Auth instance",
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });

    throw new ExternalServiceError(
      "Failed to get Auth instance",
      "AUTH_INSTANCE_ERROR"
    );
  }
};

// Firestore transaction wrapper with automatic retries
export const runTransaction = async <T>(
  callback: (transaction: admin.firestore.Transaction) => Promise<T>,
  maxAttempts = 5
): Promise<T> => {
  let attempts = 0;

  while (attempts < maxAttempts) {
    attempts++;
    try {
      return await db().runTransaction(callback);
    } catch (error) {
      // Check if error is retryable
      const isRetryable =
        error instanceof Error &&
        (error.message.includes("ABORTED") ||
          error.message.includes("DEADLINE_EXCEEDED") ||
          error.message.includes("UNAVAILABLE"));

      if (!isRetryable || attempts >= maxAttempts) {
        logger.error({
          message: "Firestore transaction failed permanently",
          error: error instanceof Error ? error.message : String(error),
          attempts,
        });

        throw new DatabaseError(
          "Database transaction failed",
          "TRANSACTION_FAILED",
          { attempts }
        );
      }

      // Exponential backoff
      const backoffMs = Math.min(1000 * (Math.pow(2, attempts) - 1), 10000);
      logger.warn({
        message: "Firestore transaction failed, retrying",
        attempts,
        nextRetryMs: backoffMs,
        error: error instanceof Error ? error.message : String(error),
      });

      await new Promise((resolve) => setTimeout(resolve, backoffMs));
    }
  }

  // This should never happen, but TypeScript needs it
  throw new DatabaseError(
    "Maximum transaction attempts exceeded",
    "MAX_TRANSACTION_ATTEMPTS"
  );
};

// Batch processing helper
export const processBatch = async <T, R>(
  items: T[],
  processFunction: (item: T) => Promise<R>,
  batchSize = 10
): Promise<R[]> => {
  const results: R[] = [];

  // Process items in batches
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const batchResults = await Promise.all(
      batch.map((item) =>
        processFunction(item).catch((error) => {
          logger.error({
            message: "Error processing batch item",
            error: error instanceof Error ? error.message : String(error),
            item,
          });
          throw error;
        })
      )
    );

    results.push(...batchResults);
  }

  return results;
};

// Export a default object for convenient imports
export default {
  initializeFirebase,
  db,
  auth,
  runTransaction,
  processBatch,
};
