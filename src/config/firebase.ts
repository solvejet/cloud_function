import admin from "firebase-admin";
import { applicationDefault, getApps } from "firebase-admin/app";
import {
  getFirestore,
  initializeFirestore,
  Settings as FirestoreSettings,
} from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";

// Improved Firestore settings for better performance
const firestoreSettings: FirestoreSettings = {
  ignoreUndefinedProperties: true,
  preferRest: true, // Use REST API for better performance in GCP
};

// Initialize Firebase function
export const initializeFirebase = (): admin.app.App => {
  try {
    // Use singleton pattern for Firebase initialization
    if (getApps().length === 0) {
      // Initialize with default application credentials
      const app = admin.initializeApp({
        credential: applicationDefault(),
      });

      // Initialize Firestore with optimized settings
      initializeFirestore(admin.app(), firestoreSettings);

      console.log("Firebase initialized successfully");
      return app;
    }
    return admin.app();
  } catch (error) {
    console.error("Error initializing Firebase:", error);
    throw new Error(
      "Firebase initialization failed. Check your credentials and permissions."
    );
  }
};

// Get Firestore instance with enhanced error handling
export const db = (): admin.firestore.Firestore => {
  try {
    return getFirestore();
  } catch (error) {
    console.error("Error getting Firestore instance:", error);
    throw new Error("Failed to get Firestore instance");
  }
};

// Get Auth instance with enhanced error handling
export const auth = (): admin.auth.Auth => {
  try {
    return getAuth();
  } catch (error) {
    console.error("Error getting Auth instance:", error);
    throw new Error("Failed to get Auth instance");
  }
};

// Export a default object for convenient imports
export default {
  initializeFirebase,
  db,
  auth,
};
