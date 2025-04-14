// src/tests/performance/performanceSuite.test.ts
import { measurePerformance } from "@/middleware/performanceMonitoring";
import { createDocument, queryDocuments } from "@/utils/database";
import { reportPerformanceIssue } from "@/utils/errorReporting";

// Mock dependencies
jest.mock("@/config/firebase");
jest.mock("@/utils/logger");
jest.mock("@/utils/errorReporting");

describe("Performance Test Suite", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  describe("Performance Monitoring", () => {
    it("should measure function execution time correctly", async () => {
      // Create a function that takes a specific amount of time
      const testFunction = jest.fn().mockImplementation(async () => {
        return new Promise((resolve) => {
          setTimeout(() => {
            resolve("test-result");
          }, 100);
        });
      });

      // Start measuring the function
      const resultPromise = measurePerformance(
        "test-operation",
        testFunction,
        50
      );

      // Fast-forward time
      jest.advanceTimersByTime(100);

      // Wait for the result
      const result = await resultPromise;

      // Verify the function was called and the correct result was returned
      expect(testFunction).toHaveBeenCalled();
      expect(result).toBe("test-result");

      // Verify that a performance issue was reported (since 100ms > 50ms threshold)
      expect(reportPerformanceIssue).toHaveBeenCalledWith(
        "test-operation",
        expect.any(Number),
        50,
        expect.any(Object)
      );
    });

    it("should not report when performance is within threshold", async () => {
      // Create a function that takes less time than the threshold
      const testFunction = jest.fn().mockImplementation(async () => {
        return new Promise((resolve) => {
          setTimeout(() => {
            resolve("fast-result");
          }, 20);
        });
      });

      // Start measuring the function with a higher threshold
      const resultPromise = measurePerformance(
        "fast-operation",
        testFunction,
        50
      );

      // Fast-forward time
      jest.advanceTimersByTime(20);

      // Wait for the result
      const result = await resultPromise;

      // Verify the function was called and the correct result was returned
      expect(testFunction).toHaveBeenCalled();
      expect(result).toBe("fast-result");

      // Verify that no performance issue was reported (since 20ms < 50ms threshold)
      expect(reportPerformanceIssue).not.toHaveBeenCalled();
    });
  });

  describe("Database Operation Performance", () => {
    beforeEach(() => {
      // Mock database functions
      jest.mock("@/utils/database", () => ({
        createDocument: jest.fn(),
        getDocumentById: jest.fn(),
        queryDocuments: jest.fn(),
      }));
    });

    it("should track database operation performance", async () => {
      // Mock createDocument implementation with delay
      (createDocument as jest.Mock).mockImplementation(async () => {
        return new Promise((resolve) => {
          setTimeout(() => {
            resolve({ id: "test-id", name: "Test Document" });
          }, 200);
        });
      });

      // Measure performance of createDocument
      const startTime = Date.now();
      const result = await measurePerformance(
        "db.createDocument",
        async () =>
          createDocument("test-collection", { name: "Test Document" }),
        100
      );
      const duration = Date.now() - startTime;

      // Verify the operation completed successfully
      expect(result).toHaveProperty("id", "test-id");

      // Verify a performance issue was reported (since operation took > 100ms)
      expect(reportPerformanceIssue).toHaveBeenCalledWith(
        "db.createDocument",
        expect.any(Number),
        100,
        expect.any(Object)
      );

      // Verify the operation took approximately the expected time
      expect(duration).toBeGreaterThanOrEqual(200);
    });

    it("should optimize query performance with pagination and indexing", async () => {
      // Mock queryDocuments to simulate a fast indexed query
      (queryDocuments as jest.Mock).mockImplementation(
        async ({ limit, orderBy }) => {
          return new Promise((resolve) => {
            setTimeout(
              () => {
                resolve({
                  documents: Array(limit || 10)
                    .fill(0)
                    .map((_, i) => ({ id: `doc-${i}`, name: `Document ${i}` })),
                  lastDoc: { id: "last-doc" },
                  total: 100,
                });
              },
              orderBy ? 30 : 200
            ); // Simulate faster query with proper indexing (orderBy)
          });
        }
      );

      // Test unoptimized query (no ordering = no index)
      await measurePerformance(
        "db.queryUnoptimized",
        async () => queryDocuments("test-collection", { limit: 10 }),
        50
      );

      // Test optimized query (with ordering = using index)
      await measurePerformance(
        "db.queryOptimized",
        async () =>
          queryDocuments("test-collection", {
            limit: 10,
            orderBy: [["createdAt", "desc"]],
          }),
        50
      );

      // The unoptimized query should report a performance issue, but the optimized one shouldn't
      expect(reportPerformanceIssue).toHaveBeenCalledTimes(1);
      expect(reportPerformanceIssue).toHaveBeenCalledWith(
        "db.queryUnoptimized",
        expect.any(Number),
        50,
        expect.any(Object)
      );
    });
  });

  describe("API Endpoint Performance", () => {
    // This would typically be an end-to-end test with a real server
    // For unit testing, we'll simulate the behavior
    it("should measure API response times", async () => {
      // Simulate an API request handler
      const mockApiHandler = async () => {
        // Simulate database operations
        await new Promise((resolve) => setTimeout(resolve, 150));
        return { status: "success", data: { items: [] } };
      };

      // Measure the API handler performance
      const result = await measurePerformance(
        "api.getItems",
        mockApiHandler,
        100
      );

      // Verify the API handler completed successfully
      expect(result).toHaveProperty("status", "success");

      // Verify a performance issue was reported (since operation took > 100ms)
      expect(reportPerformanceIssue).toHaveBeenCalledWith(
        "api.getItems",
        expect.any(Number),
        100,
        expect.any(Object)
      );
    });

    it("should optimize complex operations", async () => {
      // Simulate an operation that involves multiple steps
      const complexOperation = async () => {
        // Step 1: Get user
        await new Promise((resolve) => setTimeout(resolve, 50));

        // Step 2: Get user's roles
        await new Promise((resolve) => setTimeout(resolve, 50));

        // Step 3: Get permissions
        await new Promise((resolve) => setTimeout(resolve, 50));

        // Step 4: Process and return data
        return { user: {}, roles: [], permissions: [] };
      };

      // Measure the complex operation performance
      const result = await measurePerformance(
        "api.getUserDetails",
        complexOperation,
        200
      );

      // Verify the operation completed successfully
      expect(result).toHaveProperty("user");
      expect(result).toHaveProperty("roles");
      expect(result).toHaveProperty("permissions");

      // The total time (150ms) should be under the threshold (200ms)
      expect(reportPerformanceIssue).not.toHaveBeenCalled();
    });
  });
});
