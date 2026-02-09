/**
 * Ollama embedding provider implementation.
 * Connects to local Ollama instance for embedding generation.
 */

import axios, { AxiosInstance } from "axios";
import type { OllamaConfig } from "../../config/schema.js";
import {
  EmbeddingProvider,
  EmbeddingOptions,
  ModelNotAvailableError,
  ProviderConnectionError,
  TokenLimitExceededError,
} from "./base.js";
import { retry } from "../../utils/async.js";

/**
 * Model dimensions for Ollama models.
 */
const MODEL_DIMENSIONS: Record<string, number> = {
  "nomic-embed-text": 768,
  "nomic-embed-large": 1024,
  "mxbai-embed-large": 1024,
  "all-minilm": 384,
};

/**
 * Model token limits for Ollama models.
 */
const MODEL_MAX_TOKENS: Record<string, number> = {
  "nomic-embed-text": 8192,
  "nomic-embed-large": 8192,
  "mxbai-embed-large": 512,
  "all-minilm": 512,
};

/**
 * Ollama embedding provider.
 */
export class OllamaProvider implements EmbeddingProvider {
  readonly name = "ollama";
  readonly modelName: string;
  readonly dimensions: number;
  readonly maxTokens: number;

  private client: AxiosInstance;
  private config: OllamaConfig;

  constructor(modelName: string, config: OllamaConfig) {
    this.modelName = modelName;
    this.config = config;

    // Set dimensions and max tokens based on model
    this.dimensions = MODEL_DIMENSIONS[modelName] || 768;
    this.maxTokens = MODEL_MAX_TOKENS[modelName] || 8192;

    // Create axios client
    this.client = axios.create({
      baseURL: config.host,
      timeout: config.timeout,
      headers: {
        "Content-Type": "application/json",
      },
    });
  }

  /**
   * Generate embedding for a single text with retry logic.
   */
  async embed(text: string): Promise<number[]> {
    return retry(
      async () => {
        try {
          const response = await this.client.post("/api/embeddings", {
            model: this.modelName,
            prompt: text,
          });

          if (!response.data || !response.data.embedding) {
            throw new Error("Invalid response from Ollama API");
          }

          return response.data.embedding;
        } catch (error) {
          if (axios.isAxiosError(error)) {
            if (error.code === "ECONNREFUSED") {
              throw new ProviderConnectionError(
                "ollama",
                new Error(`Cannot connect to Ollama at ${this.config.host}`),
              );
            }
            if (error.response?.status === 404) {
              throw new ModelNotAvailableError("ollama", this.modelName);
            }
            // HTTP 500 errors are retryable
            if (error.response?.status === 500) {
              throw error; // Will be retried
            }
          }
          throw error;
        }
      },
      {
        maxRetries: 3,
        initialDelay: 1000,
        backoffMultiplier: 2,
        onRetry: (attempt, error) => {
          console.error(
            `[OLLAMA RETRY] Attempt ${attempt}/3 failed, retrying...`,
            error.message,
          );
        },
      },
    );
  }

  /**
   * Generate embeddings for multiple texts in batch.
   */
  async embedBatch(texts: string[]): Promise<number[][]> {
    // Ollama doesn't have native batch API, so we call embed sequentially
    // Could be optimized with Promise.all but may overwhelm local Ollama
    const embeddings: number[][] = [];

    for (const text of texts) {
      const embedding = await this.embed(text);
      embeddings.push(embedding);
    }

    return embeddings;
  }

  /**
   * Check if Ollama is running and model is available.
   */
  async healthCheck(): Promise<boolean> {
    try {
      // Check if Ollama is running
      const response = await this.client.get("/api/tags");

      if (!response.data || !response.data.models) {
        return false;
      }

      // Check if our model is available
      const models = response.data.models as Array<{ name: string }>;
      const modelAvailable = models.some(
        (m) => m.name === this.modelName || m.name.startsWith(this.modelName),
      );

      return modelAvailable;
    } catch (error) {
      return false;
    }
  }

  /**
   * Estimate cost (always 0 for local Ollama).
   */
  estimateCost(tokenCount: number): number {
    return 0; // Ollama is free and local
  }

  /**
   * Get available models from Ollama.
   */
  async getAvailableModels(): Promise<string[]> {
    try {
      const response = await this.client.get("/api/tags");
      if (!response.data || !response.data.models) {
        return [];
      }

      return response.data.models.map((m: any) => m.name);
    } catch (error) {
      throw new ProviderConnectionError(
        "ollama",
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Pull a model from Ollama registry.
   */
  async pullModel(): Promise<void> {
    try {
      await this.client.post("/api/pull", {
        name: this.modelName,
      });
    } catch (error) {
      throw new ProviderConnectionError(
        "ollama",
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Close and cleanup resources.
   */
  async close(): Promise<void> {
    // Axios clients don't need explicit cleanup
    // This method is here for interface compliance
  }
}

/**
 * Create Ollama provider with configuration.
 */
export function createOllamaProvider(
  modelName: string,
  config: OllamaConfig,
): OllamaProvider {
  return new OllamaProvider(modelName, config);
}
