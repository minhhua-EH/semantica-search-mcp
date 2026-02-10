/**
 * OpenAI embedding provider implementation.
 * Connects to OpenAI API for cloud-based embedding generation.
 */

import OpenAI from "openai";
import type { OpenAIConfig } from "../../config/schema.js";
import {
  EmbeddingProvider,
  EmbeddingError,
  ModelNotAvailableError,
  ProviderConnectionError,
  TokenLimitExceededError,
} from "./base.js";
import { retry } from "../../utils/async.js";
import pLimit from "p-limit";

/**
 * Model configurations for OpenAI embedding models.
 */
interface ModelConfig {
  dimensions: number;
  maxTokens: number;
  costPerMillionTokens: number; // in USD
}

const MODEL_CONFIGS: Record<string, ModelConfig> = {
  "text-embedding-3-small": {
    dimensions: 1536,
    maxTokens: 8191,
    costPerMillionTokens: 0.02,
  },
  "text-embedding-3-large": {
    dimensions: 3072,
    maxTokens: 8191,
    costPerMillionTokens: 0.13,
  },
  "text-embedding-ada-002": {
    dimensions: 1536,
    maxTokens: 8191,
    costPerMillionTokens: 0.1,
  },
};

/**
 * OpenAI rate limits (default tier).
 * Adjust based on your OpenAI account tier.
 */
const RATE_LIMITS = {
  requestsPerMinute: 500,
  tokensPerMinute: 2_000_000,
};

/**
 * OpenAI embedding provider.
 */
export class OpenAIProvider implements EmbeddingProvider {
  readonly name = "openai";
  readonly modelName: string;
  readonly dimensions: number;
  readonly maxTokens: number;

  private client: OpenAI;
  private config: OpenAIConfig;
  private modelConfig: ModelConfig;
  private rateLimiter: ReturnType<typeof pLimit>;

  constructor(modelName: string, config: OpenAIConfig) {
    this.modelName = modelName;
    this.config = config;

    // Validate and set model configuration
    this.modelConfig = MODEL_CONFIGS[modelName];
    if (!this.modelConfig) {
      throw new Error(
        `Unknown OpenAI model: ${modelName}. Supported models: ${Object.keys(MODEL_CONFIGS).join(", ")}`,
      );
    }

    // Use dimensions from config if provided, otherwise use model default
    this.dimensions = config.dimensions || this.modelConfig.dimensions;
    this.maxTokens = this.modelConfig.maxTokens;

    // Initialize OpenAI client
    this.client = new OpenAI({
      apiKey: config.apiKey,
      timeout: config.timeout,
    });

    // Rate limiter: conservative limit to avoid hitting OpenAI rate limits
    // Adjust concurrency based on your tier
    this.rateLimiter = pLimit(10);
  }

  /**
   * Generate embedding for a single text with retry logic.
   */
  async embed(text: string): Promise<number[]> {
    return retry(
      async () => {
        try {
          const response = await this.client.embeddings.create({
            model: this.modelName,
            input: text,
            dimensions:
              this.dimensions !== this.modelConfig.dimensions
                ? this.dimensions
                : undefined,
          });

          if (
            !response.data ||
            response.data.length === 0 ||
            !response.data[0].embedding
          ) {
            throw new EmbeddingError(
              "Invalid response from OpenAI API",
              "openai",
            );
          }

          return response.data[0].embedding;
        } catch (error: any) {
          // Handle OpenAI-specific errors
          if (error instanceof OpenAI.APIError) {
            if (error.status === 401) {
              throw new ProviderConnectionError(
                "openai",
                new Error("Invalid API key"),
              );
            }
            if (error.status === 404) {
              throw new ModelNotAvailableError("openai", this.modelName);
            }
            if (error.status === 429) {
              // Rate limit exceeded - will be retried
              throw new EmbeddingError(
                "Rate limit exceeded, retrying...",
                "openai",
                error,
              );
            }
            if (error.status === 500 || error.status === 503) {
              // Server errors - will be retried
              throw new EmbeddingError(
                "OpenAI server error, retrying...",
                "openai",
                error,
              );
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
            `[OPENAI RETRY] Attempt ${attempt}/3 failed, retrying...`,
            error.message,
          );
        },
      },
    );
  }

  /**
   * Generate embeddings for multiple texts in batch.
   * OpenAI supports batch embedding (up to 2048 texts per request).
   */
  async embedBatch(texts: string[]): Promise<number[][]> {
    // OpenAI supports up to 2048 texts per request
    const BATCH_SIZE = 2048;

    // If texts fit in one request, send as batch
    if (texts.length <= BATCH_SIZE) {
      return this.embedBatchInternal(texts);
    }

    // Otherwise, split into multiple batches
    const results: number[][] = [];
    for (let i = 0; i < texts.length; i += BATCH_SIZE) {
      const batch = texts.slice(i, i + BATCH_SIZE);
      const batchResults = await this.embedBatchInternal(batch);
      results.push(...batchResults);
    }

    return results;
  }

  /**
   * Internal batch embedding with rate limiting.
   */
  private async embedBatchInternal(texts: string[]): Promise<number[][]> {
    return this.rateLimiter(async () => {
      return retry(
        async () => {
          try {
            const response = await this.client.embeddings.create({
              model: this.modelName,
              input: texts,
              dimensions:
                this.dimensions !== this.modelConfig.dimensions
                  ? this.dimensions
                  : undefined,
            });

            if (!response.data || response.data.length !== texts.length) {
              throw new EmbeddingError(
                "Invalid batch response from OpenAI API",
                "openai",
              );
            }

            // Sort by index to ensure correct order
            const sortedData = response.data.sort((a, b) => a.index - b.index);
            return sortedData.map((item) => item.embedding);
          } catch (error: any) {
            // Handle OpenAI-specific errors (same as embed)
            if (error instanceof OpenAI.APIError) {
              if (error.status === 401) {
                throw new ProviderConnectionError(
                  "openai",
                  new Error("Invalid API key"),
                );
              }
              if (error.status === 404) {
                throw new ModelNotAvailableError("openai", this.modelName);
              }
              if (error.status === 429) {
                throw new EmbeddingError(
                  "Rate limit exceeded, retrying...",
                  "openai",
                  error,
                );
              }
              if (error.status === 500 || error.status === 503) {
                throw new EmbeddingError(
                  "OpenAI server error, retrying...",
                  "openai",
                  error,
                );
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
              `[OPENAI BATCH RETRY] Attempt ${attempt}/3 failed, retrying...`,
              error.message,
            );
          },
        },
      );
    });
  }

  /**
   * Check if OpenAI API is accessible.
   */
  async healthCheck(): Promise<boolean> {
    try {
      // Try to list models to check API connectivity
      await this.client.models.list();
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Estimate cost for embedding given number of tokens.
   * @param tokenCount - Number of tokens to embed
   * @returns Estimated cost in USD
   */
  estimateCost(tokenCount: number): number {
    const costPerToken = this.modelConfig.costPerMillionTokens / 1_000_000;
    return tokenCount * costPerToken;
  }

  /**
   * Get detailed cost breakdown.
   */
  getCostBreakdown(tokenCount: number): {
    model: string;
    tokens: number;
    costPerMillionTokens: number;
    estimatedCost: number;
  } {
    return {
      model: this.modelName,
      tokens: tokenCount,
      costPerMillionTokens: this.modelConfig.costPerMillionTokens,
      estimatedCost: this.estimateCost(tokenCount),
    };
  }

  /**
   * Get available OpenAI embedding models.
   */
  async getAvailableModels(): Promise<string[]> {
    try {
      const response = await this.client.models.list();
      const models = [];
      for await (const model of response) {
        if (model.id.includes("embedding")) {
          models.push(model.id);
        }
      }
      return models;
    } catch (error) {
      throw new ProviderConnectionError(
        "openai",
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Close and cleanup resources.
   */
  async close(): Promise<void> {
    // OpenAI client doesn't need explicit cleanup
    // This method is here for interface compliance
  }
}

/**
 * Create OpenAI provider with configuration.
 */
export function createOpenAIProvider(
  modelName: string,
  config: OpenAIConfig,
): OpenAIProvider {
  return new OpenAIProvider(modelName, config);
}
