/**
 * Unit tests for OpenAI embedding provider.
 */

import { jest, describe, it, expect, beforeEach } from "@jest/globals";
import type { OpenAIConfig } from "../../src/config/schema.js";
import {
  EmbeddingError,
  ModelNotAvailableError,
  ProviderConnectionError,
} from "../../src/providers/embedding/base.js";

// Mock OpenAI SDK
const mockEmbeddingsCreate = jest.fn();
const mockModelsList = jest.fn();

class MockOpenAI {
  embeddings = {
    create: mockEmbeddingsCreate,
  };
  models = {
    list: mockModelsList,
  };
  static APIError = class APIError extends Error {
    status: number;
    constructor(message: string, status: number) {
      super(message);
      this.status = status;
    }
  };
}

jest.unstable_mockModule("openai", () => ({
  default: MockOpenAI,
}));

const { OpenAIProvider } =
  await import("../../src/providers/embedding/openai.provider.js");

describe("OpenAIProvider", () => {
  const mockConfig: OpenAIConfig = {
    apiKey: "sk-test-key-1234567890",
    model: "text-embedding-3-small",
    dimensions: 1536,
    timeout: 30000,
  };

  let provider: OpenAIProvider;

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();
    mockEmbeddingsCreate.mockReset();
    mockModelsList.mockReset();

    provider = new OpenAIProvider("text-embedding-3-small", mockConfig);
  });

  describe("constructor", () => {
    it("should initialize with correct model configuration", () => {
      expect(provider.name).toBe("openai");
      expect(provider.modelName).toBe("text-embedding-3-small");
      expect(provider.dimensions).toBe(1536);
      expect(provider.maxTokens).toBe(8191);
    });

    it("should throw error for unknown model", () => {
      expect(() => {
        new OpenAIProvider("unknown-model", mockConfig);
      }).toThrow("Unknown OpenAI model");
    });

    it("should support text-embedding-3-large", () => {
      const provider = new OpenAIProvider("text-embedding-3-large", {
        ...mockConfig,
        model: "text-embedding-3-large",
        dimensions: 3072, // Use model default
      });

      expect(provider.dimensions).toBe(3072);
      expect(provider.maxTokens).toBe(8191);
    });

    it("should support text-embedding-ada-002", () => {
      const provider = new OpenAIProvider("text-embedding-ada-002", {
        ...mockConfig,
        model: "text-embedding-ada-002",
      });

      expect(provider.dimensions).toBe(1536);
      expect(provider.maxTokens).toBe(8191);
    });

    it("should use custom dimensions if provided", () => {
      const provider = new OpenAIProvider("text-embedding-3-small", {
        ...mockConfig,
        dimensions: 512,
      });

      expect(provider.dimensions).toBe(512);
    });
  });

  describe("embed", () => {
    it("should generate embedding for single text", async () => {
      const mockEmbedding = new Array(1536).fill(0).map(() => Math.random());
      mockEmbeddingsCreate.mockResolvedValue({
        data: [{ embedding: mockEmbedding, index: 0 }],
      });

      const result = await provider.embed("test text");

      expect(result).toEqual(mockEmbedding);
      expect(mockEmbeddingsCreate).toHaveBeenCalledWith({
        model: "text-embedding-3-small",
        input: "test text",
        dimensions: undefined, // Not provided when using default dimensions
      });
    });

    it("should include dimensions parameter when using custom dimensions", async () => {
      const customProvider = new OpenAIProvider("text-embedding-3-small", {
        ...mockConfig,
        dimensions: 512,
      });

      const mockEmbedding = new Array(512).fill(0).map(() => Math.random());
      mockEmbeddingsCreate.mockResolvedValue({
        data: [{ embedding: mockEmbedding, index: 0 }],
      });

      await customProvider.embed("test text");

      expect(mockEmbeddingsCreate).toHaveBeenCalledWith({
        model: "text-embedding-3-small",
        input: "test text",
        dimensions: 512,
      });
    });

    it("should throw error for invalid API response", async () => {
      mockEmbeddingsCreate.mockResolvedValue({
        data: [], // Empty response
      });

      await expect(provider.embed("test text")).rejects.toThrow(EmbeddingError);
    });

    it("should handle 401 unauthorized error", async () => {
      const error = new MockOpenAI.APIError("Unauthorized", 401);
      mockEmbeddingsCreate.mockRejectedValue(error);

      await expect(provider.embed("test text")).rejects.toThrow(
        ProviderConnectionError,
      );
    });

    it("should handle 404 model not found error", async () => {
      const error = new MockOpenAI.APIError("Model not found", 404);
      mockEmbeddingsCreate.mockRejectedValue(error);

      await expect(provider.embed("test text")).rejects.toThrow(
        ModelNotAvailableError,
      );
    });

    it("should retry on 429 rate limit error", async () => {
      const error = new MockOpenAI.APIError("Rate limit exceeded", 429);
      const mockEmbedding = new Array(1536).fill(0).map(() => Math.random());

      // Fail twice, then succeed
      mockEmbeddingsCreate
        .mockRejectedValueOnce(error)
        .mockRejectedValueOnce(error)
        .mockResolvedValueOnce({
          data: [{ embedding: mockEmbedding, index: 0 }],
        });

      const result = await provider.embed("test text");

      expect(result).toEqual(mockEmbedding);
      expect(mockEmbeddingsCreate).toHaveBeenCalledTimes(3);
    });

    it("should retry on 500 server error", async () => {
      const error = new MockOpenAI.APIError("Internal server error", 500);
      const mockEmbedding = new Array(1536).fill(0).map(() => Math.random());

      // Fail once, then succeed
      mockEmbeddingsCreate.mockRejectedValueOnce(error).mockResolvedValueOnce({
        data: [{ embedding: mockEmbedding, index: 0 }],
      });

      const result = await provider.embed("test text");

      expect(result).toEqual(mockEmbedding);
      expect(mockEmbeddingsCreate).toHaveBeenCalledTimes(2);
    });

    it("should retry on 503 service unavailable error", async () => {
      const error = new MockOpenAI.APIError("Service unavailable", 503);
      const mockEmbedding = new Array(1536).fill(0).map(() => Math.random());

      // Fail once, then succeed
      mockEmbeddingsCreate.mockRejectedValueOnce(error).mockResolvedValueOnce({
        data: [{ embedding: mockEmbedding, index: 0 }],
      });

      const result = await provider.embed("test text");

      expect(result).toEqual(mockEmbedding);
      expect(mockEmbeddingsCreate).toHaveBeenCalledTimes(2);
    });
  });

  describe("embedBatch", () => {
    it("should generate embeddings for multiple texts", async () => {
      const mockEmbeddings_data = [
        {
          embedding: new Array(1536).fill(0).map(() => Math.random()),
          index: 0,
        },
        {
          embedding: new Array(1536).fill(0).map(() => Math.random()),
          index: 1,
        },
        {
          embedding: new Array(1536).fill(0).map(() => Math.random()),
          index: 2,
        },
      ];

      mockEmbeddingsCreate.mockResolvedValue({
        data: mockEmbeddings_data,
      });

      const texts = ["text 1", "text 2", "text 3"];
      const result = await provider.embedBatch(texts);

      expect(result).toHaveLength(3);
      expect(result[0]).toEqual(mockEmbeddings_data[0].embedding);
      expect(result[1]).toEqual(mockEmbeddings_data[1].embedding);
      expect(result[2]).toEqual(mockEmbeddings_data[2].embedding);
      expect(mockEmbeddingsCreate).toHaveBeenCalledWith({
        model: "text-embedding-3-small",
        input: texts,
        dimensions: undefined,
      });
    });

    it("should handle large batches (>2048 texts)", async () => {
      // Create 3000 texts (will be split into 2 batches: 2048 + 952)
      const texts = Array.from({ length: 3000 }, (_, i) => `text ${i}`);

      // Mock responses for both batches
      const createMockBatchResponse = (count: number, startIndex: number) => {
        return {
          data: Array.from({ length: count }, (_, i) => ({
            embedding: new Array(1536).fill(0).map(() => Math.random()),
            index: startIndex + i,
          })),
        };
      };

      mockEmbeddingsCreate
        .mockResolvedValueOnce(createMockBatchResponse(2048, 0))
        .mockResolvedValueOnce(createMockBatchResponse(952, 0));

      const result = await provider.embedBatch(texts);

      expect(result).toHaveLength(3000);
      expect(mockEmbeddingsCreate).toHaveBeenCalledTimes(2);
    });

    it("should sort batch results by index", async () => {
      // Return results in wrong order
      const mockEmbeddings_data = [
        { embedding: new Array(1536).fill(2), index: 2 },
        { embedding: new Array(1536).fill(0), index: 0 },
        { embedding: new Array(1536).fill(1), index: 1 },
      ];

      mockEmbeddingsCreate.mockResolvedValue({
        data: mockEmbeddings_data,
      });

      const texts = ["text 0", "text 1", "text 2"];
      const result = await provider.embedBatch(texts);

      // Should be sorted by index
      expect(result[0]).toEqual(new Array(1536).fill(0));
      expect(result[1]).toEqual(new Array(1536).fill(1));
      expect(result[2]).toEqual(new Array(1536).fill(2));
    });

    it("should throw error for mismatched batch size", async () => {
      mockEmbeddingsCreate.mockResolvedValue({
        data: [
          {
            embedding: new Array(1536).fill(0).map(() => Math.random()),
            index: 0,
          },
        ],
      });

      const texts = ["text 1", "text 2", "text 3"];

      await expect(provider.embedBatch(texts)).rejects.toThrow(EmbeddingError);
    });
  });

  describe("healthCheck", () => {
    it("should return true when API is accessible", async () => {
      mockModelsList.mockResolvedValue([]);

      const result = await provider.healthCheck();

      expect(result).toBe(true);
      expect(mockModelsList).toHaveBeenCalled();
    });

    it("should return false when API is not accessible", async () => {
      mockModelsList.mockRejectedValue(new Error("Network error"));

      const result = await provider.healthCheck();

      expect(result).toBe(false);
    });
  });

  describe("estimateCost", () => {
    it("should calculate cost for text-embedding-3-small", () => {
      const provider = new OpenAIProvider("text-embedding-3-small", mockConfig);

      // $0.02 per 1M tokens
      expect(provider.estimateCost(1_000_000)).toBeCloseTo(0.02);
      expect(provider.estimateCost(100_000)).toBeCloseTo(0.002);
      expect(provider.estimateCost(10_000)).toBeCloseTo(0.0002);
    });

    it("should calculate cost for text-embedding-3-large", () => {
      const provider = new OpenAIProvider("text-embedding-3-large", {
        ...mockConfig,
        model: "text-embedding-3-large",
      });

      // $0.13 per 1M tokens
      expect(provider.estimateCost(1_000_000)).toBeCloseTo(0.13);
      expect(provider.estimateCost(100_000)).toBeCloseTo(0.013);
    });

    it("should calculate cost for text-embedding-ada-002", () => {
      const provider = new OpenAIProvider("text-embedding-ada-002", {
        ...mockConfig,
        model: "text-embedding-ada-002",
      });

      // $0.10 per 1M tokens
      expect(provider.estimateCost(1_000_000)).toBeCloseTo(0.1);
      expect(provider.estimateCost(100_000)).toBeCloseTo(0.01);
    });
  });

  describe("getCostBreakdown", () => {
    it("should return detailed cost information", () => {
      const breakdown = provider.getCostBreakdown(500_000);

      expect(breakdown).toEqual({
        model: "text-embedding-3-small",
        tokens: 500_000,
        costPerMillionTokens: 0.02,
        estimatedCost: expect.any(Number),
      });
      expect(breakdown.estimatedCost).toBeCloseTo(0.01);
    });
  });

  describe("getAvailableModels", () => {
    it("should list available embedding models", async () => {
      mockModelsList.mockReturnValue({
        [Symbol.asyncIterator]: async function* () {
          yield { id: "text-embedding-3-small" };
          yield { id: "text-embedding-3-large" };
          yield { id: "gpt-4" }; // Should be filtered out
          yield { id: "text-embedding-ada-002" };
        },
      });

      const models = await provider.getAvailableModels();

      expect(models).toEqual([
        "text-embedding-3-small",
        "text-embedding-3-large",
        "text-embedding-ada-002",
      ]);
    });

    it("should throw ProviderConnectionError on failure", async () => {
      mockModelsList.mockRejectedValue(new Error("Network error"));

      await expect(provider.getAvailableModels()).rejects.toThrow(
        ProviderConnectionError,
      );
    });
  });

  describe("close", () => {
    it("should close without errors", async () => {
      await expect(provider.close()).resolves.toBeUndefined();
    });
  });
});
