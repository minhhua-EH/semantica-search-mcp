/**
 * Base interface for embedding providers.
 * All embedding providers must implement this interface.
 */

/**
 * Embedding provider interface.
 */
export interface EmbeddingProvider {
  /** Provider name (e.g., "ollama", "openai") */
  readonly name: string;

  /** Model name (e.g., "nomic-embed-text") */
  readonly modelName: string;

  /** Embedding vector dimensions */
  readonly dimensions: number;

  /** Maximum tokens the model can handle */
  readonly maxTokens: number;

  /**
   * Generate embedding for a single text.
   * @param text - Text to embed
   * @returns Embedding vector
   */
  embed(text: string): Promise<number[]>;

  /**
   * Generate embeddings for multiple texts in batch.
   * @param texts - Array of texts to embed
   * @returns Array of embedding vectors
   */
  embedBatch(texts: string[]): Promise<number[][]>;

  /**
   * Check if the provider is healthy and accessible.
   * @returns True if healthy, false otherwise
   */
  healthCheck(): Promise<boolean>;

  /**
   * Estimate cost for embedding given number of tokens.
   * @param tokenCount - Number of tokens
   * @returns Estimated cost in USD (0 for local providers)
   */
  estimateCost(tokenCount: number): number;

  /**
   * Close and cleanup resources (connections, clients, etc.).
   */
  close(): Promise<void>;
}

/**
 * Embedding options for fine-tuning behavior.
 */
export interface EmbeddingOptions {
  /** Timeout in milliseconds */
  timeout?: number;

  /** Number of retries on failure */
  retries?: number;

  /** Batch size for batch operations */
  batchSize?: number;
}

/**
 * Embedding error types.
 */
export class EmbeddingError extends Error {
  constructor(
    message: string,
    public readonly provider: string,
    public readonly cause?: Error,
  ) {
    super(message);
    this.name = "EmbeddingError";
  }
}

/**
 * Model not available error.
 */
export class ModelNotAvailableError extends EmbeddingError {
  constructor(provider: string, model: string) {
    super(`Model ${model} is not available`, provider);
    this.name = "ModelNotAvailableError";
  }
}

/**
 * Provider connection error.
 */
export class ProviderConnectionError extends EmbeddingError {
  constructor(provider: string, cause?: Error) {
    super(`Failed to connect to ${provider}`, provider, cause);
    this.name = "ProviderConnectionError";
  }
}

/**
 * Token limit exceeded error.
 */
export class TokenLimitExceededError extends EmbeddingError {
  constructor(provider: string, tokenCount: number, maxTokens: number) {
    super(`Token count ${tokenCount} exceeds maximum ${maxTokens}`, provider);
    this.name = "TokenLimitExceededError";
  }
}
