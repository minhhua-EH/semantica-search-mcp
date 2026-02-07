/**
 * Base interface for vector database providers.
 * All vector DB providers must implement this interface.
 */

import type {
  Vector,
  SearchResult,
  CollectionStats,
  SearchOptions,
  InsertOptions,
} from "../../models/vector.js";

/**
 * Vector database provider interface.
 */
export interface VectorDBProvider {
  /** Provider name (e.g., "milvus", "qdrant") */
  readonly name: string;

  /** Whether provider is connected */
  isConnected: boolean;

  /**
   * Connect to the vector database.
   */
  connect(): Promise<void>;

  /**
   * Disconnect from the vector database.
   */
  close(): Promise<void>;

  /**
   * Create a new collection.
   * @param name - Collection name
   * @param dimensions - Vector dimensions
   */
  createCollection(name: string, dimensions: number): Promise<void>;

  /**
   * Delete a collection.
   * @param name - Collection name
   */
  deleteCollection(name: string): Promise<void>;

  /**
   * Check if a collection exists.
   * @param name - Collection name
   */
  collectionExists(name: string): Promise<boolean>;

  /**
   * Insert vectors into a collection.
   * @param collection - Collection name
   * @param vectors - Vectors to insert
   * @param options - Insert options
   */
  insert(
    collection: string,
    vectors: Vector[],
    options?: InsertOptions,
  ): Promise<void>;

  /**
   * Search for similar vectors.
   * @param collection - Collection name
   * @param query - Query vector
   * @param options - Search options
   */
  search(
    collection: string,
    query: number[],
    options?: SearchOptions,
  ): Promise<SearchResult[]>;

  /**
   * Delete vectors by IDs.
   * @param collection - Collection name
   * @param ids - Vector IDs to delete
   */
  delete(collection: string, ids: string[]): Promise<void>;

  /**
   * Get collection statistics.
   * @param collection - Collection name
   */
  getStats(collection: string): Promise<CollectionStats>;

  /**
   * Check if the provider is healthy and accessible.
   */
  healthCheck(): Promise<boolean>;
}

/**
 * Vector DB error types.
 */
export class VectorDBError extends Error {
  constructor(
    message: string,
    public readonly provider: string,
    public readonly cause?: Error,
  ) {
    super(message);
    this.name = "VectorDBError";
  }
}

/**
 * Collection not found error.
 */
export class CollectionNotFoundError extends VectorDBError {
  constructor(provider: string, collection: string) {
    super(`Collection ${collection} not found`, provider);
    this.name = "CollectionNotFoundError";
  }
}

/**
 * Collection already exists error.
 */
export class CollectionExistsError extends VectorDBError {
  constructor(provider: string, collection: string) {
    super(`Collection ${collection} already exists`, provider);
    this.name = "CollectionExistsError";
  }
}

/**
 * Connection error.
 */
export class ConnectionError extends VectorDBError {
  constructor(provider: string, cause?: Error) {
    super(`Failed to connect to ${provider}`, provider, cause);
    this.name = "ConnectionError";
  }
}

/**
 * Dimension mismatch error.
 */
export class DimensionMismatchError extends VectorDBError {
  constructor(provider: string, expected: number, actual: number) {
    super(`Dimension mismatch: expected ${expected}, got ${actual}`, provider);
    this.name = "DimensionMismatchError";
  }
}
