import { Request, Response } from "express";
import { User } from "../../../models/User";
import {
  createUser,
  getUserDetails,
  updateUserRoles,
} from "../../../controllers/userController";
import { auth } from "../../../config/firebase";

// Mock types
type MockRequest = Partial<Request>;
type MockResponse = Partial<Response> & {
  status: jest.Mock;
  json: jest.Mock;
};

// Mock Firebase Admin and User model
jest.mock("firebase-admin", () => ({
  auth: jest.fn().mockReturnValue({
    createUser: jest.fn(),
    getUser: jest.fn(),
  }),
}));

// Mock the config/firebase module
jest.mock("../../../config/firebase", () => ({
  auth: jest.fn().mockReturnValue({
    createUser: jest.fn(),
    getUser: jest.fn(),
  }),
  initializeFirebase: jest.fn(),
}));

jest.mock("../../../models/User", () => ({
  User: {
    assignRolesToUser: jest.fn(),
    getUserRoles: jest.fn(),
  },
}));

describe("User Controller", () => {
  let mockRequest: MockRequest;
  let mockResponse: MockResponse;

  beforeEach(() => {
    mockRequest = {};
    mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("createUser", () => {
    test("should create a user successfully", async () => {
      // Setup
      mockRequest.body = {
        email: "test@example.com",
        password: "password123",
        displayName: "Test User",
        roleIds: ["role1", "role2"],
      };

      const mockUserRecord = {
        uid: "user123",
      };

      (auth().createUser as jest.Mock).mockResolvedValue(mockUserRecord);
      (User.assignRolesToUser as jest.Mock).mockResolvedValue(undefined);

      // Execute
      await createUser(mockRequest as Request, mockResponse as Response);

      // Assert
      expect(auth().createUser).toHaveBeenCalledWith({
        email: "test@example.com",
        password: "password123",
        displayName: "Test User",
        emailVerified: false,
      });

      expect(User.assignRolesToUser).toHaveBeenCalledWith("user123", [
        "role1",
        "role2",
      ]);
      expect(mockResponse.status).toHaveBeenCalledWith(201);
      expect(mockResponse.json).toHaveBeenCalledWith({
        message: "User created successfully",
        userId: "user123",
      });
    });

    test("should handle errors when creating a user", async () => {
      // Setup
      mockRequest.body = {
        email: "test@example.com",
        password: "password123",
        displayName: "Test User",
      };

      const error = new Error("Failed to create user");
      (auth().createUser as jest.Mock).mockRejectedValue(error);

      // Execute
      await createUser(mockRequest as Request, mockResponse as Response);

      // Assert
      expect(auth().createUser).toHaveBeenCalled();
      expect(mockResponse.status).toHaveBeenCalledWith(500);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: "Failed to create user",
      });
    });
  });

  describe("getUserDetails", () => {
    test("should return user details successfully", async () => {
      // Setup
      mockRequest.params = { id: "user123" };

      const mockUserRecord = {
        uid: "user123",
        email: "test@example.com",
        displayName: "Test User",
        emailVerified: true,
        disabled: false,
        metadata: {
          creationTime: "2023-01-01T00:00:00Z",
          lastSignInTime: "2023-01-02T00:00:00Z",
        },
      };

      const mockUserRoles = {
        userId: "user123",
        roleIds: ["role1", "role2"],
      };

      (auth().getUser as jest.Mock).mockResolvedValue(mockUserRecord);
      (User.getUserRoles as jest.Mock).mockResolvedValue(mockUserRoles);

      // Execute
      await getUserDetails(mockRequest as Request, mockResponse as Response);

      // Assert
      expect(auth().getUser).toHaveBeenCalledWith("user123");
      expect(User.getUserRoles).toHaveBeenCalledWith("user123");
      expect(mockResponse.status).toHaveBeenCalledWith(200);
      expect(mockResponse.json).toHaveBeenCalledWith({
        user: {
          uid: "user123",
          email: "test@example.com",
          displayName: "Test User",
          emailVerified: true,
          disabled: false,
          metadata: {
            creationTime: "2023-01-01T00:00:00Z",
            lastSignInTime: "2023-01-02T00:00:00Z",
          },
        },
        roles: ["role1", "role2"],
      });
    });

    test("should handle user not found error", async () => {
      // Setup
      mockRequest.params = { id: "nonexistent-user" };

      const error = new Error("User not found");
      (auth().getUser as jest.Mock).mockRejectedValue(error);

      // Execute
      await getUserDetails(mockRequest as Request, mockResponse as Response);

      // Assert
      expect(auth().getUser).toHaveBeenCalledWith("nonexistent-user");
      expect(mockResponse.status).toHaveBeenCalledWith(500);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: "Failed to fetch user details",
      });
    });
  });

  describe("updateUserRoles", () => {
    test("should update user roles successfully", async () => {
      // Setup
      mockRequest.params = { id: "user123" };
      mockRequest.body = { roleIds: ["role3", "role4"] };

      (auth().getUser as jest.Mock).mockResolvedValue({ uid: "user123" });
      (User.assignRolesToUser as jest.Mock).mockResolvedValue(undefined);

      // Execute
      await updateUserRoles(mockRequest as Request, mockResponse as Response);

      // Assert
      expect(auth().getUser).toHaveBeenCalledWith("user123");
      expect(User.assignRolesToUser).toHaveBeenCalledWith("user123", [
        "role3",
        "role4",
      ]);
      expect(mockResponse.status).toHaveBeenCalledWith(200);
      expect(mockResponse.json).toHaveBeenCalledWith({
        message: "User roles updated successfully",
      });
    });

    test("should handle user not found error when updating roles", async () => {
      // Setup
      mockRequest.params = { id: "nonexistent-user" };
      mockRequest.body = { roleIds: ["role3", "role4"] };

      const error = new Error("User not found");
      (auth().getUser as jest.Mock).mockRejectedValue(error);

      // Execute
      await updateUserRoles(mockRequest as Request, mockResponse as Response);

      // Assert
      expect(auth().getUser).toHaveBeenCalledWith("nonexistent-user");
      expect(mockResponse.status).toHaveBeenCalledWith(500);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: "Failed to update user roles",
      });
    });
  });
});
