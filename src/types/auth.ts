// src/types/auth.ts
// This file contains standardized auth-related type definitions for the application

export type Permission = {
  id: string;
  name: string;
  description: string;
  resource: string;
  action: "create" | "read" | "update" | "delete" | "manage";
};

export type Role = {
  id: string;
  name: string;
  description: string;
  permissions: string[]; // Array of permission IDs
};

export type UserRole = {
  userId: string;
  roleIds: string[]; // Array of role IDs
};

export interface AuthUser {
  uid: string;
  email: string | null;
  emailVerified: boolean;
  displayName: string | null;
  disabled: boolean;
  metadata: {
    creationTime: string;
    lastSignInTime: string;
  };
  customClaims?: {
    roles?: string[];
  };
}
