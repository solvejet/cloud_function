import * as admin from "firebase-admin";
import { Permission } from "@/auth";

// Extend Express Request interface
declare global {
  namespace Express {
    interface Request {
      user?: admin.auth.DecodedIdToken;
      permissions?: Permission[];
    }
  }
}
