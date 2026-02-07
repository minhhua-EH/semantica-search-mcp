/**
 * Factory for creating embedding providers based on configuration.
 */

import type { EmbeddingConfig } from "../../config/schema.js";
import { EmbeddingProvider as EmbeddingProviderEnum } from "../../models/types.js";
import { EmbeddingProvider } from "./base.js";
import { createOllamaProvider } from "./ollama.provider.js";

/**
 * Create embedding provider from configuration.
 */
export function createEmbeddingProvider(
  config: EmbeddingConfig,
): EmbeddingProvider {
  switch (config.provider) {
    case EmbeddingProviderEnum.OLLAMA: {
      if (!config.ollama) {
        throw new Error(
          "Ollama configuration is required when using Ollama provider",
        );
      }
      return createOllamaProvider(config.model, config.ollama);
    }

    case EmbeddingProviderEnum.OPENAI: {
      // TODO: Implement in Phase 2
      throw new Error("OpenAI provider not yet implemented (Phase 2)");
    }

    default:
      throw new Error(`Unknown embedding provider: ${config.provider}`);
  }
}

/**
 * Validate embedding provider configuration.
 */
export function validateEmbeddingProviderConfig(
  config: EmbeddingConfig,
): string[] {
  const errors: string[] = [];

  // Check provider-specific configuration
  if (config.provider === EmbeddingProviderEnum.OLLAMA) {
    if (!config.ollama) {
      errors.push("Ollama configuration is missing");
    } else {
      if (!config.ollama.host) {
        errors.push("Ollama host is required");
      }
      if (config.ollama.timeout && config.ollama.timeout <= 0) {
        errors.push("Ollama timeout must be positive");
      }
    }
  }

  if (config.provider === EmbeddingProviderEnum.OPENAI) {
    if (!config.openai) {
      errors.push("OpenAI configuration is missing");
    } else {
      if (!config.openai.apiKey) {
        errors.push("OpenAI API key is required");
      }
      if (!config.openai.model) {
        errors.push("OpenAI model is required");
      }
    }
  }

  // Check dimensions
  if (config.dimensions <= 0) {
    errors.push("Embedding dimensions must be positive");
  }

  // Check batch size
  if (config.batchSize <= 0) {
    errors.push("Batch size must be positive");
  }

  return errors;
}
