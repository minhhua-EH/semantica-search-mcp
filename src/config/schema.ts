/**
 * Configuration schema with Zod validation.
 * Defines the structure and validation rules for user configuration.
 */

import { z } from "zod";
import {
  IndexingGranularity,
  ChunkingStrategy,
  ReindexStrategy,
  SearchStrategy,
  SearchResultFormat,
  EmbeddingProvider,
  VectorDBProvider,
  Language,
  MetricType,
  IndexType,
  LogLevel,
} from "../models/types.js";

/**
 * Project configuration
 */
export const ProjectConfigSchema = z.object({
  name: z.string().min(1).describe("Project name"),
  root: z.string().min(1).describe("Project root directory"),
  languages: z
    .array(z.nativeEnum(Language))
    .min(1)
    .describe("Supported languages"),
});

/**
 * Language-specific configuration
 */
export const LanguageConfigSchema = z.object({
  extensions: z
    .array(z.string())
    .describe('File extensions (e.g., [".ts", ".tsx"])'),
  chunkTypes: z
    .array(z.string())
    .describe('Chunk types to extract (e.g., ["function", "class"])'),
});

/**
 * Chunking configuration
 */
export const ChunkingConfigSchema = z.object({
  strategy: z
    .nativeEnum(ChunkingStrategy)
    .default(ChunkingStrategy.AST_SPLIT_MERGE)
    .describe("Chunking strategy to use"),

  maxTokens: z
    .number()
    .int()
    .positive()
    .default(250)
    .describe("Maximum tokens per chunk"),

  minTokens: z
    .number()
    .int()
    .positive()
    .default(50)
    .describe("Minimum tokens per chunk (for merging)"),

  mergeSiblings: z
    .boolean()
    .default(true)
    .describe("Merge small adjacent chunks"),

  preserveHierarchy: z
    .boolean()
    .default(true)
    .describe("Keep parent-child relationships in chunks"),
});

/**
 * Indexing configuration
 */
export const IndexingConfigSchema = z.object({
  granularity: z
    .nativeEnum(IndexingGranularity)
    .default(IndexingGranularity.HYBRID)
    .describe("How code is split into chunks"),

  chunkingStrategy: z
    .nativeEnum(ChunkingStrategy)
    .default(ChunkingStrategy.AST_SPLIT_MERGE)
    .describe("AST parsing strategy"),

  maxChunkSize: z
    .number()
    .int()
    .positive()
    .default(250)
    .describe("Maximum chunk size in tokens"),

  overlap: z
    .number()
    .int()
    .nonnegative()
    .default(50)
    .describe("Token overlap between chunks (for sliding window)"),

  chunking: ChunkingConfigSchema.optional().describe(
    "Advanced chunking configuration",
  ),

  reindexStrategy: z
    .nativeEnum(ReindexStrategy)
    .default(ReindexStrategy.INCREMENTAL)
    .describe("When/how to update the index"),

  include: z
    .array(z.string())
    .default(["src/**/*", "lib/**/*"])
    .describe("Glob patterns to include"),

  exclude: z
    .array(z.string())
    .default([
      "node_modules/**",
      "**/*.test.ts",
      "**/*.spec.ts",
      "**/*.test.rb",
      "**/*.spec.rb",
      "dist/**",
      "build/**",
      "coverage/**",
    ])
    .describe("Glob patterns to exclude"),

  languageConfig: z
    .record(z.string(), LanguageConfigSchema)
    .default({
      typescript: {
        extensions: [".ts", ".tsx"],
        chunkTypes: ["function", "class", "interface", "type"],
      },
      ruby: {
        extensions: [".rb"],
        chunkTypes: ["def", "class", "module"],
      },
    })
    .describe("Language-specific configuration"),
});

/**
 * Ollama embedding provider configuration
 */
export const OllamaConfigSchema = z.object({
  host: z
    .string()
    .url()
    .default("http://localhost:11434")
    .describe("Ollama host URL"),
  timeout: z
    .number()
    .int()
    .positive()
    .default(30000)
    .describe("Request timeout (ms)"),
});

/**
 * OpenAI embedding provider configuration
 */
export const OpenAIConfigSchema = z.object({
  apiKey: z.string().min(1).describe("OpenAI API key (use ${OPENAI_API_KEY})"),
  model: z
    .string()
    .default("text-embedding-3-small")
    .describe("OpenAI embedding model"),
  dimensions: z
    .number()
    .int()
    .positive()
    .default(1536)
    .describe("Embedding dimensions"),
  timeout: z
    .number()
    .int()
    .positive()
    .default(30000)
    .describe("Request timeout (ms)"),
});

/**
 * Embedding configuration
 */
export const EmbeddingConfigSchema = z.object({
  provider: z
    .nativeEnum(EmbeddingProvider)
    .default(EmbeddingProvider.OLLAMA)
    .describe("Embedding provider"),

  model: z.string().default("nomic-embed-text").describe("Model name"),

  dimensions: z
    .number()
    .int()
    .positive()
    .default(768)
    .describe("Embedding vector dimensions"),

  batchSize: z
    .number()
    .int()
    .positive()
    .default(32)
    .describe("Batch size for embedding generation"),

  concurrency: z
    .number()
    .int()
    .positive()
    .default(3)
    .describe("Number of concurrent embedding batches (parallel processing)"),

  ollama: OllamaConfigSchema.optional().describe(
    "Ollama-specific configuration",
  ),
  openai: OpenAIConfigSchema.optional().describe(
    "OpenAI-specific configuration",
  ),
});

/**
 * Milvus vector DB configuration
 */
export const MilvusConfigSchema = z.object({
  host: z.string().default("localhost").describe("Milvus host"),
  port: z.number().int().positive().default(19530).describe("Milvus port"),
  username: z.string().default("").describe("Milvus username (optional)"),
  password: z.string().default("").describe("Milvus password (optional)"),
  secure: z.boolean().default(false).describe("Use TLS/SSL"),
  indexType: z
    .nativeEnum(IndexType)
    .default(IndexType.IVF_FLAT)
    .describe("Index type for vector search"),
  metricType: z
    .nativeEnum(MetricType)
    .default(MetricType.COSINE)
    .describe("Distance metric"),
});

/**
 * Qdrant vector DB configuration
 */
export const QdrantConfigSchema = z.object({
  host: z.string().default("localhost").describe("Qdrant host"),
  port: z.number().int().positive().default(6333).describe("Qdrant port"),
  apiKey: z
    .string()
    .default("")
    .describe("Qdrant API key (use ${QDRANT_API_KEY})"),
  https: z.boolean().default(false).describe("Use HTTPS"),
});

/**
 * Vector database configuration
 */
export const VectorDBConfigSchema = z.object({
  provider: z
    .nativeEnum(VectorDBProvider)
    .default(VectorDBProvider.MILVUS)
    .describe("Vector database provider"),

  collectionName: z
    .string()
    .default("code_chunks")
    .describe("Collection/index name"),

  milvus: MilvusConfigSchema.optional().describe(
    "Milvus-specific configuration",
  ),
  qdrant: QdrantConfigSchema.optional().describe(
    "Qdrant-specific configuration",
  ),
});

/**
 * Hybrid search configuration
 */
export const HybridSearchConfigSchema = z.object({
  vectorWeight: z
    .number()
    .min(0)
    .max(1)
    .default(0.7)
    .describe("Weight for vector similarity (0-1)"),

  keywordWeight: z
    .number()
    .min(0)
    .max(1)
    .default(0.3)
    .describe("Weight for keyword matching (0-1)"),
});

/**
 * Search filter configuration
 */
export const SearchFilterConfigSchema = z.object({
  enableLanguageFilter: z
    .boolean()
    .default(true)
    .describe("Enable language filtering"),
  enablePathFilter: z.boolean().default(true).describe("Enable path filtering"),
  enableDateFilter: z
    .boolean()
    .default(false)
    .describe("Enable date filtering"),
});

/**
 * Search configuration
 */
export const SearchConfigSchema = z.object({
  strategy: z
    .nativeEnum(SearchStrategy)
    .default(SearchStrategy.HYBRID)
    .describe("Search strategy"),

  resultFormat: z
    .nativeEnum(SearchResultFormat)
    .default(SearchResultFormat.HYBRID)
    .describe("Result format"),

  maxResults: z
    .number()
    .int()
    .positive()
    .default(10)
    .describe("Maximum results to return"),

  minScore: z
    .number()
    .min(0)
    .max(1)
    .default(0.5)
    .describe("Minimum similarity score (0-1)"),

  hybrid: HybridSearchConfigSchema.optional().describe(
    "Hybrid search configuration",
  ),

  filters: SearchFilterConfigSchema.optional().describe(
    "Search filter configuration",
  ),
});

/**
 * Performance configuration
 */
export const PerformanceConfigSchema = z.object({
  maxFileSize: z
    .string()
    .default("1MB")
    .describe('Maximum file size to index (e.g., "1MB", "500KB")'),

  maxConcurrent: z
    .number()
    .int()
    .positive()
    .default(10)
    .describe("Maximum concurrent operations"),

  cacheEnabled: z.boolean().default(true).describe("Enable caching"),

  cacheTTL: z
    .number()
    .int()
    .positive()
    .default(3600)
    .describe("Cache TTL in seconds"),

  batchDelay: z
    .number()
    .int()
    .nonnegative()
    .default(500)
    .describe("Delay in milliseconds between embedding batches (0 to disable)"),
});

/**
 * Merkle tree configuration
 */
export const MerkleConfigSchema = z.object({
  enabled: z
    .boolean()
    .default(true)
    .describe("Enable Merkle tree change detection"),

  storePath: z
    .string()
    .default(".semantica/merkle")
    .describe("Merkle tree storage path"),

  algorithm: z.string().default("sha256").describe("Hash algorithm"),
});

/**
 * Logging configuration
 */
export const LoggingConfigSchema = z.object({
  level: z.nativeEnum(LogLevel).default(LogLevel.INFO).describe("Log level"),

  file: z.string().optional().describe("Log file path (optional)"),

  pretty: z.boolean().default(true).describe("Pretty print logs"),
});

/**
 * Main configuration schema
 */
export const ConfigSchema = z.object({
  version: z.string().default("1.0.0").describe("Configuration version"),

  project: ProjectConfigSchema.optional().describe("Project configuration"),

  indexing: IndexingConfigSchema.default({
    granularity: IndexingGranularity.HYBRID,
    chunkingStrategy: ChunkingStrategy.AST_SPLIT_MERGE,
    maxChunkSize: 250,
    overlap: 50,
    reindexStrategy: ReindexStrategy.INCREMENTAL,
    include: ["src/**/*", "lib/**/*"],
    exclude: [
      "node_modules/**",
      "**/*.test.ts",
      "**/*.spec.ts",
      "**/*.test.rb",
      "**/*.spec.rb",
      "dist/**",
      "build/**",
      "coverage/**",
    ],
    languageConfig: {
      typescript: {
        extensions: [".ts", ".tsx"],
        chunkTypes: ["function", "class", "interface", "type"],
      },
      ruby: {
        extensions: [".rb"],
        chunkTypes: ["def", "class", "module"],
      },
    },
  }).describe("Indexing configuration"),

  embedding: EmbeddingConfigSchema.default({
    provider: EmbeddingProvider.OLLAMA,
    model: "nomic-embed-text",
    dimensions: 768,
    batchSize: 32,
  }).describe("Embedding configuration"),

  vectordb: VectorDBConfigSchema.default({
    provider: VectorDBProvider.MILVUS,
    collectionName: "code_chunks",
  }).describe("Vector database configuration"),

  search: SearchConfigSchema.default({
    strategy: SearchStrategy.HYBRID,
    resultFormat: SearchResultFormat.HYBRID,
    maxResults: 10,
    minScore: 0.7,
  }).describe("Search configuration"),

  performance: PerformanceConfigSchema.optional().describe(
    "Performance configuration",
  ),

  merkle: MerkleConfigSchema.optional().describe("Merkle tree configuration"),

  logging: LoggingConfigSchema.optional().describe("Logging configuration"),
});

/**
 * Export TypeScript types from Zod schemas
 */
export type ProjectConfig = z.infer<typeof ProjectConfigSchema>;
export type LanguageConfig = z.infer<typeof LanguageConfigSchema>;
export type ChunkingConfig = z.infer<typeof ChunkingConfigSchema>;
export type IndexingConfig = z.infer<typeof IndexingConfigSchema>;
export type OllamaConfig = z.infer<typeof OllamaConfigSchema>;
export type OpenAIConfig = z.infer<typeof OpenAIConfigSchema>;
export type EmbeddingConfig = z.infer<typeof EmbeddingConfigSchema>;
export type MilvusConfig = z.infer<typeof MilvusConfigSchema>;
export type QdrantConfig = z.infer<typeof QdrantConfigSchema>;
export type VectorDBConfig = z.infer<typeof VectorDBConfigSchema>;
export type HybridSearchConfig = z.infer<typeof HybridSearchConfigSchema>;
export type SearchFilterConfig = z.infer<typeof SearchFilterConfigSchema>;
export type SearchConfig = z.infer<typeof SearchConfigSchema>;
export type PerformanceConfig = z.infer<typeof PerformanceConfigSchema>;
export type MerkleConfig = z.infer<typeof MerkleConfigSchema>;
export type LoggingConfig = z.infer<typeof LoggingConfigSchema>;
export type Config = z.infer<typeof ConfigSchema>;
