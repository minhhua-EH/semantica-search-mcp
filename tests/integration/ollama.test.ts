/**
 * Integration tests for Ollama embedding provider.
 * Requires Ollama running at localhost:11434 with nomic-embed-text model.
 */

import { OllamaProvider } from "../../src/providers/embedding/ollama.provider";
import type { OllamaConfig } from "../../src/config/schema";

describe("OllamaProvider Integration Tests", () => {
  let provider: OllamaProvider;

  const config: OllamaConfig = {
    host: "http://localhost:11434",
    timeout: 30000,
  };

  beforeAll(() => {
    provider = new OllamaProvider("nomic-embed-text", config);
  });

  describe("Health Check", () => {
    test("should connect to Ollama successfully", async () => {
      const isHealthy = await provider.healthCheck();

      if (!isHealthy) {
        console.warn(
          "⚠️  Ollama is not running or nomic-embed-text model is not available",
        );
        console.warn("   Run: ollama pull nomic-embed-text");
      }

      expect(isHealthy).toBe(true);
    }, 10000);

    test("should list available models", async () => {
      const models = await provider.getAvailableModels();

      expect(Array.isArray(models)).toBe(true);
      expect(models.length).toBeGreaterThan(0);

      console.log("Available models:", models);
    }, 10000);
  });

  describe("Embedding Generation", () => {
    test("should generate embedding for single text", async () => {
      const text =
        "function calculateSum(a: number, b: number) { return a + b; }";
      const embedding = await provider.embed(text);

      expect(Array.isArray(embedding)).toBe(true);
      expect(embedding.length).toBe(768); // nomic-embed-text dimensions
      expect(typeof embedding[0]).toBe("number");
    }, 15000);

    test("should generate embeddings for batch of texts", async () => {
      const texts = [
        "function add(a, b) { return a + b; }",
        "class Calculator { sum(x, y) { return x + y; } }",
        "const multiply = (a, b) => a * b;",
      ];

      const embeddings = await provider.embedBatch(texts);

      expect(Array.isArray(embeddings)).toBe(true);
      expect(embeddings.length).toBe(3);
      expect(embeddings[0].length).toBe(768);
      expect(embeddings[1].length).toBe(768);
      expect(embeddings[2].length).toBe(768);
    }, 30000);

    test("should generate different embeddings for different texts", async () => {
      const text1 = "function add(a, b) { return a + b; }";
      const text2 = "class DatabaseConnection { connect() { } }";

      const embedding1 = await provider.embed(text1);
      const embedding2 = await provider.embed(text2);

      // Calculate cosine similarity
      const dotProduct = embedding1.reduce(
        (sum, val, i) => sum + val * embedding2[i],
        0,
      );
      const magnitude1 = Math.sqrt(
        embedding1.reduce((sum, val) => sum + val * val, 0),
      );
      const magnitude2 = Math.sqrt(
        embedding2.reduce((sum, val) => sum + val * val, 0),
      );
      const similarity = dotProduct / (magnitude1 * magnitude2);

      expect(similarity).toBeLessThan(0.99); // Should be different
      console.log("Similarity between different texts:", similarity);
    }, 30000);

    test("should generate similar embeddings for similar texts", async () => {
      const text1 = "function add(a, b) { return a + b; }";
      const text2 = "function sum(x, y) { return x + y; }";

      const embedding1 = await provider.embed(text1);
      const embedding2 = await provider.embed(text2);

      // Calculate cosine similarity
      const dotProduct = embedding1.reduce(
        (sum, val, i) => sum + val * embedding2[i],
        0,
      );
      const magnitude1 = Math.sqrt(
        embedding1.reduce((sum, val) => sum + val * val, 0),
      );
      const magnitude2 = Math.sqrt(
        embedding2.reduce((sum, val) => sum + val * val, 0),
      );
      const similarity = dotProduct / (magnitude1 * magnitude2);

      expect(similarity).toBeGreaterThan(0.6); // Should be similar
      console.log("Similarity between similar texts:", similarity);
    }, 30000);
  });

  describe("Provider Properties", () => {
    test("should have correct provider properties", () => {
      expect(provider.name).toBe("ollama");
      expect(provider.modelName).toBe("nomic-embed-text");
      expect(provider.dimensions).toBe(768);
      expect(provider.maxTokens).toBe(8192);
    });

    test("should estimate zero cost for local provider", () => {
      const cost = provider.estimateCost(1000);
      expect(cost).toBe(0);
    });
  });
});
