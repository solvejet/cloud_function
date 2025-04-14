import { db } from "@/config/firebase";
import { logger } from "./logger";
import { DatabaseError, NotFoundError } from "./errors";
import * as admin from "firebase-admin";

/**
 * Enhanced database utilities with error handling and logging
 */

/**
 * Creates a document with auto-generated ID
 */
export async function createDocument<T extends Record<string, any>>(
  collection: string,
  data: Omit<T, "id">
): Promise<T> {
  try {
    const docRef = db().collection(collection).doc();
    const docWithId = { ...data, id: docRef.id } as unknown as T;

    await docRef.set(docWithId);
    logger.debug({
      message: `Document created in ${collection}`,
      docId: docRef.id,
    });

    return docWithId;
  } catch (error) {
    logger.error({
      message: `Error creating document in ${collection}`,
      error: error instanceof Error ? error.message : String(error),
      data: JSON.stringify(data),
    });

    throw new DatabaseError(
      `Failed to create document in ${collection}`,
      "DOCUMENT_CREATE_ERROR",
      { collection }
    );
  }
}

/**
 * Gets a document by ID with strong typing
 */
export async function getDocumentById<T>(
  collection: string,
  id: string,
  errorIfNotFound = true
): Promise<T | null> {
  try {
    const docRef = db().collection(collection).doc(id);
    const doc = await docRef.get();

    if (!doc.exists) {
      if (errorIfNotFound) {
        logger.warn({
          message: `Document not found in ${collection}`,
          docId: id,
        });

        throw new NotFoundError(
          `Document not found in ${collection}`,
          "DOCUMENT_NOT_FOUND",
          { collection, id }
        );
      }

      return null;
    }

    return { ...doc.data(), id: doc.id } as T;
  } catch (error) {
    // Re-throw NotFoundError
    if (error instanceof NotFoundError) {
      throw error;
    }

    logger.error({
      message: `Error fetching document from ${collection}`,
      docId: id,
      error: error instanceof Error ? error.message : String(error),
    });

    throw new DatabaseError(
      `Failed to fetch document from ${collection}`,
      "DOCUMENT_FETCH_ERROR",
      { collection, id }
    );
  }
}

/**
 * Updates a document by ID
 */
export async function updateDocument<T>(
  collection: string,
  id: string,
  data: Partial<T>
): Promise<void> {
  try {
    const docRef = db().collection(collection).doc(id);
    const doc = await docRef.get();

    if (!doc.exists) {
      logger.warn({
        message: `Document not found for update in ${collection}`,
        docId: id,
      });

      throw new NotFoundError(
        `Document not found in ${collection}`,
        "DOCUMENT_NOT_FOUND",
        { collection, id }
      );
    }

    await docRef.update(data);

    logger.debug({
      message: `Document updated in ${collection}`,
      docId: id,
      updatedFields: Object.keys(data),
    });
  } catch (error) {
    // Re-throw NotFoundError
    if (error instanceof NotFoundError) {
      throw error;
    }

    logger.error({
      message: `Error updating document in ${collection}`,
      docId: id,
      error: error instanceof Error ? error.message : String(error),
      data: JSON.stringify(data),
    });

    throw new DatabaseError(
      `Failed to update document in ${collection}`,
      "DOCUMENT_UPDATE_ERROR",
      { collection, id }
    );
  }
}

/**
 * Deletes a document by ID
 */
export async function deleteDocument(
  collection: string,
  id: string,
  errorIfNotFound = true
): Promise<void> {
  try {
    const docRef = db().collection(collection).doc(id);
    const doc = await docRef.get();

    if (!doc.exists && errorIfNotFound) {
      logger.warn({
        message: `Document not found for deletion in ${collection}`,
        docId: id,
      });

      throw new NotFoundError(
        `Document not found in ${collection}`,
        "DOCUMENT_NOT_FOUND",
        { collection, id }
      );
    }

    await docRef.delete();

    logger.debug({
      message: `Document deleted from ${collection}`,
      docId: id,
    });
  } catch (error) {
    // Re-throw NotFoundError
    if (error instanceof NotFoundError) {
      throw error;
    }

    logger.error({
      message: `Error deleting document from ${collection}`,
      docId: id,
      error: error instanceof Error ? error.message : String(error),
    });

    throw new DatabaseError(
      `Failed to delete document from ${collection}`,
      "DOCUMENT_DELETE_ERROR",
      { collection, id }
    );
  }
}

/**
 * Queries documents with pagination
 */
export async function queryDocuments<T>(
  collection: string,
  options: {
    where?: [string, admin.firestore.WhereFilterOp, any][];
    orderBy?: [string, "asc" | "desc"][];
    limit?: number;
    startAfter?: admin.firestore.DocumentSnapshot | null;
    select?: string[];
  } = {}
): Promise<{
  documents: T[];
  lastDoc: admin.firestore.DocumentSnapshot | null;
  total: number;
}> {
  try {
    let query: admin.firestore.Query = db().collection(collection);

    // Apply where filters
    if (options.where) {
      for (const [field, op, value] of options.where) {
        query = query.where(field, op, value);
      }
    }

    // Apply order by
    if (options.orderBy) {
      for (const [field, direction] of options.orderBy) {
        query = query.orderBy(field, direction);
      }
    }

    // Apply pagination
    if (options.startAfter) {
      query = query.startAfter(options.startAfter);
    }

    // Apply field selection
    if (options.select) {
      query = query.select(...options.select);
    }

    // Get total count (for pagination)
    let countQuery: admin.firestore.Query = db().collection(collection);

    // Reapply where filters
    if (options.where) {
      for (const [field, op, value] of options.where) {
        countQuery = countQuery.where(field, op, value);
      }
    }
    const countSnapshot = await countQuery.count().get();
    const total = countSnapshot.data().count;

    // Apply limit after counting
    if (options.limit) {
      query = query.limit(options.limit);
    }

    // Execute query
    const snapshot = await query.get();

    // Map results and include document ID
    const documents = snapshot.docs.map((doc) => {
      return { ...doc.data(), id: doc.id } as T;
    });

    // Get last document for pagination
    const lastDoc =
      snapshot.docs.length > 0 ? snapshot.docs[snapshot.docs.length - 1] : null;

    logger.debug({
      message: `Query executed on ${collection}`,
      resultCount: documents.length,
      total,
      filters: options.where?.length || 0,
    });

    return { documents, lastDoc: lastDoc ?? null, total };
  } catch (error) {
    logger.error({
      message: `Error querying documents from ${collection}`,
      error: error instanceof Error ? error.message : String(error),
      options: JSON.stringify(options),
    });

    throw new DatabaseError(
      `Failed to query documents from ${collection}`,
      "DOCUMENT_QUERY_ERROR",
      { collection }
    );
  }
}

/**
 * Performs a bulk write operation
 */
export async function bulkWrite<T extends Record<string, any>>(
  collection: string,
  operations: Array<{
    type: "create" | "update" | "delete";
    id?: string;
    data?: Partial<T>;
  }>
): Promise<void> {
  try {
    const batch = db().batch();

    for (const op of operations) {
      const docRef = op.id
        ? db().collection(collection).doc(op.id)
        : db().collection(collection).doc();

      switch (op.type) {
        case "create":
          batch.set(docRef, { ...op.data, id: docRef.id });
          break;
        case "update":
          batch.update(docRef, op.data as admin.firestore.UpdateData<T> || {});
          break;
        case "delete":
          batch.delete(docRef);
          break;
      }
    }

    await batch.commit();

    logger.debug({
      message: `Bulk operation completed on ${collection}`,
      operationCount: operations.length,
      createOps: operations.filter((op) => op.type === "create").length,
      updateOps: operations.filter((op) => op.type === "update").length,
      deleteOps: operations.filter((op) => op.type === "delete").length,
    });
  } catch (error) {
    logger.error({
      message: `Error performing bulk write on ${collection}`,
      error: error instanceof Error ? error.message : String(error),
      operationCount: operations.length,
    });

    throw new DatabaseError(
      `Failed to perform bulk operation on ${collection}`,
      "BULK_OPERATION_ERROR",
      { collection, operationCount: operations.length }
    );
  }
}
