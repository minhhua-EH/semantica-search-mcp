/**
 * Configuration validator with helpful error messages.
 * Validates configuration against Zod schema and checks for conflicts.
 */

import { ZodError } from "zod";
import { ConfigSchema, type Config } from "./schema.js";

/**
 * Validation result.
 */
export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
}

/**
 * Validation error.
 */
export interface ValidationError {
  path: string;
  message: string;
  code: string;
}

/**
 * Validation warning.
 */
export interface ValidationWarning {
  path: string;
  message: string;
}

/**
 * Configuration validator class.
 */
export class ConfigValidator {
  /**
   * Validate configuration against schema.
   */
  validate(config: any): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    // Validate against Zod schema
    try {
      ConfigSchema.parse(config);
    } catch (error) {
      if (error instanceof ZodError) {
        for (const issue of error.errors) {
          errors.push({
            path: issue.path.join("."),
            message: this.formatZodError(issue),
            code: issue.code,
          });
        }
      } else {
        errors.push({
          path: "",
          message: String(error),
          code: "unknown",
        });
      }
    }

    // Additional validation checks
    if (config) {
      // Check embedding dimensions match
      this.validateEmbeddingDimensions(config, warnings);

      // Check hybrid search weights sum to 1
      this.validateHybridSearchWeights(config, warnings);

      // Check file size format
      this.validateFileSize(config, warnings);

      // Check provider-specific config exists
      this.validateProviderConfig(config, warnings);
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Validate configuration and throw if invalid.
   */
  validateOrThrow(config: any): Config {
    const result = this.validate(config);

    if (!result.valid) {
      const errorMessages = result.errors
        .map((e) => `  ${e.path}: ${e.message}`)
        .join("\n");

      throw new Error(`Configuration validation failed:\n${errorMessages}`);
    }

    // Log warnings
    if (result.warnings.length > 0) {
      console.warn("Configuration warnings:");
      for (const warning of result.warnings) {
        console.warn(`  ${warning.path}: ${warning.message}`);
      }
    }

    return config as Config;
  }

  /**
   * Format Zod error for better readability.
   */
  private formatZodError(issue: any): string {
    switch (issue.code) {
      case "invalid_type":
        return `Expected ${issue.expected}, received ${issue.received}`;

      case "invalid_enum_value":
        return `Invalid value. Expected one of: ${issue.options.join(", ")}`;

      case "too_small":
        return issue.type === "string"
          ? `String must contain at least ${issue.minimum} character(s)`
          : `Value must be at least ${issue.minimum}`;

      case "too_big":
        return issue.type === "string"
          ? `String must contain at most ${issue.maximum} character(s)`
          : `Value must be at most ${issue.maximum}`;

      default:
        return issue.message;
    }
  }

  /**
   * Validate embedding dimensions consistency.
   */
  private validateEmbeddingDimensions(
    config: any,
    warnings: ValidationWarning[],
  ): void {
    const embedding = config.embedding;
    if (!embedding) return;

    const { provider, model, dimensions } = embedding;

    // Check known model dimensions
    const knownDimensions: Record<string, number> = {
      "nomic-embed-text": 768,
      "nomic-embed-large": 1024,
      "text-embedding-3-small": 1536,
      "text-embedding-3-large": 3072,
      "text-embedding-ada-002": 1536,
    };

    if (model && knownDimensions[model]) {
      const expectedDim = knownDimensions[model];
      if (dimensions !== expectedDim) {
        warnings.push({
          path: "embedding.dimensions",
          message: `Model "${model}" typically uses ${expectedDim} dimensions, but configured with ${dimensions}. This may cause issues.`,
        });
      }
    }
  }

  /**
   * Validate hybrid search weights.
   */
  private validateHybridSearchWeights(
    config: any,
    warnings: ValidationWarning[],
  ): void {
    const hybrid = config.search?.hybrid;
    if (!hybrid) return;

    const { vectorWeight, keywordWeight } = hybrid;
    const sum = vectorWeight + keywordWeight;

    if (Math.abs(sum - 1.0) > 0.01) {
      warnings.push({
        path: "search.hybrid",
        message: `Vector weight (${vectorWeight}) + keyword weight (${keywordWeight}) = ${sum}. Should sum to 1.0 for optimal results.`,
      });
    }
  }

  /**
   * Validate file size format.
   */
  private validateFileSize(config: any, warnings: ValidationWarning[]): void {
    const maxFileSize = config.performance?.maxFileSize;
    if (!maxFileSize) return;

    const pattern = /^\d+(\.\d+)?(KB|MB|GB)$/i;
    if (!pattern.test(maxFileSize)) {
      warnings.push({
        path: "performance.maxFileSize",
        message: `Invalid file size format "${maxFileSize}". Expected format: "500KB", "1MB", "1.5GB"`,
      });
    }
  }

  /**
   * Validate provider-specific configuration exists.
   */
  private validateProviderConfig(
    config: any,
    warnings: ValidationWarning[],
  ): void {
    // Check embedding provider config
    const embeddingProvider = config.embedding?.provider;
    if (embeddingProvider === "ollama" && !config.embedding?.ollama) {
      warnings.push({
        path: "embedding.ollama",
        message:
          "Ollama provider selected but no Ollama configuration provided. Using defaults.",
      });
    }
    if (embeddingProvider === "openai" && !config.embedding?.openai) {
      warnings.push({
        path: "embedding.openai",
        message:
          "OpenAI provider selected but no OpenAI configuration provided. This will likely fail.",
      });
    }

    // Check vector DB provider config
    const vectordbProvider = config.vectordb?.provider;
    if (vectordbProvider === "milvus" && !config.vectordb?.milvus) {
      warnings.push({
        path: "vectordb.milvus",
        message:
          "Milvus provider selected but no Milvus configuration provided. Using defaults.",
      });
    }
    if (vectordbProvider === "qdrant" && !config.vectordb?.qdrant) {
      warnings.push({
        path: "vectordb.qdrant",
        message:
          "Qdrant provider selected but no Qdrant configuration provided. This will likely fail.",
      });
    }
  }
}

/**
 * Validate configuration.
 */
export function validateConfig(config: any): ValidationResult {
  const validator = new ConfigValidator();
  return validator.validate(config);
}

/**
 * Validate configuration and throw if invalid.
 */
export function validateConfigOrThrow(config: any): Config {
  const validator = new ConfigValidator();
  return validator.validateOrThrow(config);
}
