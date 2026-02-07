/**
 * Vector and search result types for vector database operations.
 */

/**
 * Vector with embedding and metadata.
 */
export interface Vector {
  /** Unique identifier */
  id: string;

  /** Embedding vector */
  vector: number[];

  /** Metadata associated with the vector */
  metadata: Record<string, any>;
}

/**
 * Search result from vector database.
 */
export interface SearchResult {
  /** Document/chunk ID */
  id: string;

  /** Similarity score (0-1, higher is better) */
  score: number;

  /** Metadata associated with the result */
  metadata: Record<string, any>;

  /** Optional: The vector itself */
  vector?: number[];
}

/**
 * Collection statistics.
 */
export interface CollectionStats {
  /** Total number of vectors */
  count: number;

  /** Vector dimensions */
  dimensions: number;

  /** Whether collection is indexed */
  indexed: boolean;

  /** Index type (if indexed) */
  indexType?: string;

  /** Metric type */
  metricType?: string;
}

/**
 * Search options for vector database.
 */
export interface SearchOptions {
  /** Maximum number of results */
  limit?: number;

  /** Minimum similarity score */
  minScore?: number;

  /** Metadata filters */
  filters?: Record<string, any>;

  /** Whether to include vectors in results */
  includeVectors?: boolean;
}

/**
 * Insert options for vector database.
 */
export interface InsertOptions {
  /** Batch size for insertion */
  batchSize?: number;

  /** Whether to skip duplicate check */
  skipDuplicateCheck?: boolean;
}
