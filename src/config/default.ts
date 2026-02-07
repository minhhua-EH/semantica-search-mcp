/**
 * Default configuration values.
 * Used when no user configuration is provided or as fallback for missing values.
 */

import {
  IndexingGranularity,
  ChunkingStrategy,
  ReindexStrategy,
  SearchStrategy,
  SearchResultFormat,
  EmbeddingProvider,
  VectorDBProvider,
  MetricType,
  IndexType,
  LogLevel,
} from "../models/types.js";
import type { Config } from "./schema.js";

/**
 * Default configuration based on best practices and research.
 */
export const DEFAULT_CONFIG: Config = {
  version: "1.0.0",

  indexing: {
    granularity: IndexingGranularity.HYBRID,
    chunkingStrategy: ChunkingStrategy.AST_SPLIT_MERGE,
    maxChunkSize: 250, // GitHub Copilot's approach
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
      "**/*.min.js",
      "**/*.map",
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
  },

  embedding: {
    provider: EmbeddingProvider.OLLAMA,
    model: "nomic-embed-text",
    dimensions: 768, // nomic-embed-text dimensions
    batchSize: 32,
    concurrency: 3,
    ollama: {
      host: "http://localhost:11434",
      timeout: 30000,
    },
  },

  vectordb: {
    provider: VectorDBProvider.MILVUS,
    collectionName: "code_chunks",
    milvus: {
      host: "localhost",
      port: 19530,
      username: "",
      password: "",
      secure: false,
      indexType: IndexType.IVF_FLAT,
      metricType: MetricType.COSINE,
    },
  },

  search: {
    strategy: SearchStrategy.HYBRID,
    resultFormat: SearchResultFormat.HYBRID,
    maxResults: 10,
    minScore: 0.7,
    hybrid: {
      vectorWeight: 0.7,
      keywordWeight: 0.3,
    },
    filters: {
      enableLanguageFilter: true,
      enablePathFilter: true,
      enableDateFilter: false,
    },
  },

  performance: {
    maxFileSize: "1MB",
    maxConcurrent: 10,
    cacheEnabled: true,
    cacheTTL: 3600,
    batchDelay: 500,
  },

  merkle: {
    enabled: true,
    storePath: ".semantica/merkle",
    algorithm: "sha256",
  },

  logging: {
    level: LogLevel.INFO,
    pretty: true,
  },
};

/**
 * Fast indexing preset - optimized for speed.
 */
export const FAST_PRESET: Partial<Config> = {
  indexing: {
    granularity: IndexingGranularity.FILE,
    chunkingStrategy: ChunkingStrategy.SLIDING_WINDOW,
    maxChunkSize: 500,
    overlap: 0,
    reindexStrategy: ReindexStrategy.MANUAL,
    include: ["src/**/*"],
    exclude: ["node_modules/**", "dist/**", "build/**"],
    languageConfig: {},
  },
  search: {
    strategy: SearchStrategy.SEMANTIC,
    resultFormat: SearchResultFormat.SNIPPET,
    maxResults: 5,
    minScore: 0.6,
  },
  performance: {
    maxFileSize: "500KB",
    maxConcurrent: 20,
    cacheEnabled: true,
    cacheTTL: 7200,
    batchDelay: 300,
  },
};

/**
 * Quality preset - optimized for search quality.
 */
export const QUALITY_PRESET: Partial<Config> = {
  indexing: {
    granularity: IndexingGranularity.FUNCTION,
    chunkingStrategy: ChunkingStrategy.AST_SPLIT_MERGE,
    maxChunkSize: 200,
    overlap: 100,
    reindexStrategy: ReindexStrategy.INCREMENTAL,
    include: ["src/**/*", "lib/**/*", "app/**/*"],
    exclude: [
      "node_modules/**",
      "**/*.test.*",
      "**/*.spec.*",
      "dist/**",
      "build/**",
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
  },
  search: {
    strategy: SearchStrategy.HYBRID,
    resultFormat: SearchResultFormat.CONTEXT,
    maxResults: 20,
    minScore: 0.75,
    hybrid: {
      vectorWeight: 0.8,
      keywordWeight: 0.2,
    },
  },
  performance: {
    maxFileSize: "2MB",
    maxConcurrent: 5,
    cacheEnabled: true,
    cacheTTL: 1800,
    batchDelay: 700,
  },
};

/**
 * Local privacy preset - all processing local, no external APIs.
 */
export const LOCAL_PRESET: Partial<Config> = {
  embedding: {
    provider: EmbeddingProvider.OLLAMA,
    model: "nomic-embed-text",
    dimensions: 768,
    batchSize: 32,
    concurrency: 3,
    ollama: {
      host: "http://localhost:11434",
      timeout: 30000,
    },
  },
  vectordb: {
    provider: VectorDBProvider.MILVUS,
    collectionName: "code_chunks",
    milvus: {
      host: "localhost",
      port: 19530,
      username: "",
      password: "",
      secure: false,
      indexType: IndexType.IVF_FLAT,
      metricType: MetricType.COSINE,
    },
  },
};

/**
 * Get preset by name.
 */
export function getPreset(name: string): Partial<Config> | null {
  switch (name.toLowerCase()) {
    case "fast":
      return FAST_PRESET;
    case "quality":
      return QUALITY_PRESET;
    case "local":
      return LOCAL_PRESET;
    default:
      return null;
  }
}
