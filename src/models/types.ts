/**
 * Shared type definitions and enums used across the system.
 * These types define the core options for indexing, chunking, search, etc.
 */

/**
 * Indexing granularity determines how code is split into chunks.
 */
export enum IndexingGranularity {
  /** Whole file as single chunk */
  FILE = 'file',
  /** Individual functions/methods */
  FUNCTION = 'function',
  /** Complete classes/modules */
  CLASS = 'class',
  /** Semantic code blocks */
  BLOCK = 'block',
  /** Smart mix based on size (default) */
  HYBRID = 'hybrid',
  /** Fixed-size chunks with overlap */
  FIXED = 'fixed',
}

/**
 * Chunking strategy determines how AST parsing is applied.
 */
export enum ChunkingStrategy {
  /** Recursive split-then-merge algorithm (default) */
  AST_SPLIT_MERGE = 'ast-split-merge',
  /** Extract specific node types */
  AST_EXTRACT = 'ast-extract',
  /** Fixed-size chunks with overlap (fallback) */
  SLIDING_WINDOW = 'sliding-window',
}

/**
 * Re-indexing strategy determines when/how to update the index.
 */
export enum ReindexStrategy {
  /** User triggers re-index manually */
  MANUAL = 'manual',
  /** Watch file changes and auto re-index */
  WATCH = 'watch',
  /** Track changes with Merkle trees (default) */
  INCREMENTAL = 'incremental',
  /** Periodic re-indexing (cron-like) */
  SCHEDULED = 'scheduled',
}

/**
 * Search strategy determines how queries are processed.
 */
export enum SearchStrategy {
  /** Pure vector similarity search */
  SEMANTIC = 'semantic',
  /** BM25 text search */
  KEYWORD = 'keyword',
  /** Combine semantic + keyword (default) */
  HYBRID = 'hybrid',
  /** Include dependency information */
  GRAPH = 'graph',
}

/**
 * Search result format determines how results are returned.
 */
export enum SearchResultFormat {
  /** Code snippet with line numbers (3-10 lines) */
  SNIPPET = 'snippet',
  /** Snippet + surrounding context (full function/class) */
  CONTEXT = 'context',
  /** Whole file with highlighted match */
  FILE = 'file',
  /** Smart formatting based on match size (default) */
  HYBRID = 'hybrid',
  /** Multiple results with similarity scores */
  RANKED = 'ranked',
}

/**
 * Embedding provider type.
 */
export enum EmbeddingProvider {
  /** Ollama (local) */
  OLLAMA = 'ollama',
  /** OpenAI API */
  OPENAI = 'openai',
}

/**
 * Vector database provider type.
 */
export enum VectorDBProvider {
  /** Milvus (local or cloud) */
  MILVUS = 'milvus',
  /** Qdrant (local or cloud) */
  QDRANT = 'qdrant',
}

/**
 * Supported programming languages.
 */
export enum Language {
  TYPESCRIPT = 'typescript',
  RUBY = 'ruby',
  JAVASCRIPT = 'javascript',
  PYTHON = 'python',
  GO = 'go',
  JAVA = 'java',
}

/**
 * Code chunk type classification.
 */
export enum ChunkType {
  FILE = 'file',
  FUNCTION = 'function',
  METHOD = 'method',
  CLASS = 'class',
  MODULE = 'module',
  INTERFACE = 'interface',
  TYPE = 'type',
  BLOCK = 'block',
}

/**
 * Metric type for vector similarity.
 */
export enum MetricType {
  /** Cosine similarity (default) */
  COSINE = 'COSINE',
  /** L2 (Euclidean) distance */
  L2 = 'L2',
  /** Inner product */
  IP = 'IP',
}

/**
 * Index type for vector database.
 */
export enum IndexType {
  /** Inverted file with flat compression (default for Milvus) */
  IVF_FLAT = 'IVF_FLAT',
  /** IVF with product quantization */
  IVF_PQ = 'IVF_PQ',
  /** Hierarchical navigable small world */
  HNSW = 'HNSW',
  /** Flat (brute force) */
  FLAT = 'FLAT',
}

/**
 * Log level for logging utility.
 */
export enum LogLevel {
  DEBUG = 'debug',
  INFO = 'info',
  WARN = 'warn',
  ERROR = 'error',
}
