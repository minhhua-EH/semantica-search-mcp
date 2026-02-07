/**
 * Factory for creating vector database providers based on configuration.
 */

import type { VectorDBConfig } from "../../config/schema.js";
import { VectorDBProvider as VectorDBProviderEnum } from "../../models/types.js";
import { VectorDBProvider } from "./base.js";
import { createMilvusProvider } from "./milvus.provider.js";

/**
 * Create vector DB provider from configuration.
 */
export function createVectorDBProvider(
  config: VectorDBConfig,
): VectorDBProvider {
  switch (config.provider) {
    case VectorDBProviderEnum.MILVUS: {
      if (!config.milvus) {
        throw new Error(
          "Milvus configuration is required when using Milvus provider",
        );
      }
      return createMilvusProvider(config.milvus);
    }

    case VectorDBProviderEnum.QDRANT: {
      // TODO: Implement in Phase 2
      throw new Error("Qdrant provider not yet implemented (Phase 2)");
    }

    default:
      throw new Error(`Unknown vector DB provider: ${config.provider}`);
  }
}

/**
 * Validate vector DB provider configuration.
 */
export function validateVectorDBProviderConfig(
  config: VectorDBConfig,
): string[] {
  const errors: string[] = [];

  // Check provider-specific configuration
  if (config.provider === VectorDBProviderEnum.MILVUS) {
    if (!config.milvus) {
      errors.push("Milvus configuration is missing");
    } else {
      if (!config.milvus.host) {
        errors.push("Milvus host is required");
      }
      if (!config.milvus.port || config.milvus.port <= 0) {
        errors.push("Milvus port must be positive");
      }
      if (!config.milvus.indexType) {
        errors.push("Milvus index type is required");
      }
      if (!config.milvus.metricType) {
        errors.push("Milvus metric type is required");
      }
    }
  }

  if (config.provider === VectorDBProviderEnum.QDRANT) {
    if (!config.qdrant) {
      errors.push("Qdrant configuration is missing");
    } else {
      if (!config.qdrant.host) {
        errors.push("Qdrant host is required");
      }
      if (!config.qdrant.port || config.qdrant.port <= 0) {
        errors.push("Qdrant port must be positive");
      }
    }
  }

  // Check collection name
  if (!config.collectionName || config.collectionName.trim() === "") {
    errors.push("Collection name is required");
  }

  return errors;
}
