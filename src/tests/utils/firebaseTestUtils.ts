// src/tests/utils/firebaseTestUtils.ts
import { AppError, NotFoundError, DatabaseError } from "@/utils/errors";

/**
 * Helper to create correctly typed mock errors for testing
 */
export function createMockError(
  errorClass: typeof AppError,
  message: string,
  errorCode?: string,
  context?: Record<string, unknown>
): AppError {
  // Create an error instance
  const error = new Error(message);

  // Add the properties that make it match our error types
  Object.defineProperties(error, {
    name: { value: errorClass.name },
    statusCode: {
      value: getStatusCodeForErrorType(errorClass),
    },
    errorCode: {
      value: errorCode || getDefaultErrorCodeForType(errorClass),
    },
    context: { value: context || {} },
    isOperational: { value: true },
  });

  return error as AppError;
}

/**
 * Get the standard status code for an error type
 */
function getStatusCodeForErrorType(errorClass: typeof AppError): number {
  switch (errorClass.name) {
    case "BadRequestError":
      return 400;
    case "UnauthorizedError":
      return 401;
    case "ForbiddenError":
      return 403;
    case "NotFoundError":
      return 404;
    case "ConflictError":
      return 409;
    case "ValidationError":
      return 422;
    case "TooManyRequestsError":
      return 429;
    case "DatabaseError":
    case "InternalServerError":
    case "ExternalServiceError":
    case "FirebaseAuthError":
    default:
      return 500;
  }
}

/**
 * Get the default error code for an error type
 */
function getDefaultErrorCodeForType(errorClass: typeof AppError): string {
  switch (errorClass.name) {
    case "BadRequestError":
      return "BAD_REQUEST";
    case "UnauthorizedError":
      return "UNAUTHORIZED";
    case "ForbiddenError":
      return "FORBIDDEN";
    case "NotFoundError":
      return "NOT_FOUND";
    case "ConflictError":
      return "CONFLICT";
    case "ValidationError":
      return "VALIDATION_ERROR";
    case "TooManyRequestsError":
      return "RATE_LIMIT_EXCEEDED";
    case "DatabaseError":
      return "DATABASE_ERROR";
    case "ExternalServiceError":
      return "EXTERNAL_SERVICE_ERROR";
    case "FirebaseAuthError":
      return "FIREBASE_AUTH_ERROR";
    case "InternalServerError":
    default:
      return "INTERNAL_ERROR";
  }
}

/**
 * Creates a Firestore mock collection with document handling
 * This is a more sophisticated mock that properly handles NotFoundError
 */
export function createMockFirestoreCollection() {
  // Create a Map to store mock documents
  const documents = new Map<string, any>();

  // Create the collection mock object
  const collection = {
    // Store a document
    addDocument: (id: string, data: any) => {
      documents.set(id, { ...data, id });
      return { id, ...data };
    },

    // Get reference to document (for mocking Firestore doc() method)
    doc: (id: string) => ({
      id,
      // Mock get() method
      get: jest.fn().mockImplementation(async () => {
        const data = documents.get(id);
        return {
          exists: !!data,
          id,
          data: () => data,
          ref: {
            delete: jest.fn().mockImplementation(() => {
              if (!documents.has(id)) {
                throw createMockError(
                  NotFoundError,
                  "Document not found",
                  "DOCUMENT_NOT_FOUND",
                  { id }
                );
              }
              documents.delete(id);
            }),
            update: jest.fn().mockImplementation((updateData) => {
              if (!documents.has(id)) {
                throw createMockError(
                  NotFoundError,
                  "Document not found",
                  "DOCUMENT_NOT_FOUND",
                  { id }
                );
              }
              const currentData = documents.get(id);
              documents.set(id, { ...currentData, ...updateData });
            }),
            set: jest.fn().mockImplementation((newData) => {
              documents.set(id, { ...newData, id });
            }),
          },
        };
      }),
      // Add shortcuts to common Firestore methods
      delete: jest.fn().mockImplementation(async () => {
        if (!documents.has(id)) {
          throw createMockError(
            NotFoundError,
            "Document not found",
            "DOCUMENT_NOT_FOUND",
            { id }
          );
        }
        documents.delete(id);
      }),
      update: jest.fn().mockImplementation(async (updateData) => {
        if (!documents.has(id)) {
          throw createMockError(
            NotFoundError,
            "Document not found",
            "DOCUMENT_NOT_FOUND",
            { id }
          );
        }
        const currentData = documents.get(id);
        documents.set(id, { ...currentData, ...updateData });
      }),
      set: jest.fn().mockImplementation(async (newData) => {
        documents.set(id, { ...newData, id });
      }),
    }),

    // Helper to generate a new document ID
    generateId: () => `auto-${Math.random().toString(36).substring(2, 15)}`,

    // Mock where() method
    where: jest.fn().mockReturnThis(),

    // Mock orderBy() method
    orderBy: jest.fn().mockReturnThis(),

    // Mock limit() method
    limit: jest.fn().mockReturnThis(),

    // Mock get() method for queries
    get: jest.fn().mockImplementation(async () => {
      const docs = Array.from(documents.entries()).map(([id, data]) => ({
        id,
        data: () => data,
        exists: true,
      }));
      return {
        docs,
        empty: docs.length === 0,
      };
    }),

    // Access the raw documents map for testing
    _documents: documents,

    // Helper to clear all documents (for test cleanup)
    clear: () => {
      documents.clear();
    },
  };

  return collection;
}

/**
 * Creates a complete mock Firebase setup for testing
 */
export function createMockFirebase() {
  // Create collections Map
  const collections = new Map<
    string,
    ReturnType<typeof createMockFirestoreCollection>
  >();

  // Firebase Mock
  const firebase = {
    // Firestore
    db: jest.fn().mockImplementation(() => ({
      collection: jest.fn().mockImplementation((collectionName: string) => {
        // Create collection if it doesn't exist
        if (!collections.has(collectionName)) {
          collections.set(collectionName, createMockFirestoreCollection());
        }
        return collections.get(collectionName);
      }),

      // Batch operations
      batch: jest.fn().mockReturnValue({
        set: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
        commit: jest.fn().mockResolvedValue({}),
      }),

      // Transactions
      runTransaction: jest.fn().mockImplementation(async (callback) => {
        const transaction = {
          get: jest.fn().mockImplementation(async (docRef) => {
            return await docRef.get();
          }),
          set: jest.fn().mockImplementation((docRef, data) => {
            return docRef.set(data);
          }),
          update: jest.fn().mockImplementation((docRef, data) => {
            return docRef.update(data);
          }),
          delete: jest.fn().mockImplementation((docRef) => {
            return docRef.delete();
          }),
        };

        return await callback(transaction);
      }),
    })),

    // Auth
    auth: jest.fn().mockReturnValue({
      createCustomToken: jest
        .fn()
        .mockImplementation((uid) =>
          Promise.resolve(`custom-token-for-${uid}`)
        ),
      verifyIdToken: jest.fn().mockImplementation((token) => {
        if (token === "invalid-token") {
          throw new Error("Invalid token");
        }
        return Promise.resolve({
          uid: "test-user-id",
          email: "test@example.com",
        });
      }),
      getUserByEmail: jest.fn().mockResolvedValue({
        uid: "test-user-id",
        email: "test@example.com",
        disabled: false,
      }),
      getUser: jest.fn().mockResolvedValue({
        uid: "test-user-id",
        email: "test@example.com",
        displayName: "Test User",
        emailVerified: true,
        disabled: false,
        metadata: {
          creationTime: "2023-01-01T00:00:00Z",
          lastSignInTime: "2023-01-02T00:00:00Z",
        },
      }),
      setCustomUserClaims: jest.fn().mockResolvedValue(undefined),
      revokeRefreshTokens: jest.fn().mockResolvedValue(undefined),
      createUser: jest.fn().mockResolvedValue({
        uid: "new-user-id",
        email: "newuser@example.com",
      }),
    }),

    // Helper to access collections for testing
    _collections: collections,

    // Helper to reset all collections (for test cleanup)
    clearAll: () => {
      for (const collection of collections.values()) {
        collection.clear();
      }
    },
  };

  return firebase;
}

// Export all error types for convenience in tests
export { AppError, NotFoundError, DatabaseError };
