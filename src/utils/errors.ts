/**
 * Custom error classes for better error handling and debugging.
 */

/**
 * Base error for all application errors.
 */
export class SemanticaError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly details?: any,
  ) {
    super(message);
    this.name = "SemanticaError";
  }
}

/**
 * Indexing-related errors.
 */
export class IndexingError extends SemanticaError {
  constructor(message: string, details?: any) {
    super(message, "INDEXING_ERROR", details);
    this.name = "IndexingError";
  }
}

/**
 * File not found error.
 */
export class FileNotFoundError extends IndexingError {
  constructor(filePath: string) {
    super(`File not found: ${filePath}`, { filePath });
    this.name = "FileNotFoundError";
  }
}

/**
 * File too large error.
 */
export class FileTooLargeError extends IndexingError {
  constructor(filePath: string, size: number, maxSize: number) {
    super(
      `File too large: ${filePath} (${size} bytes, max: ${maxSize} bytes)`,
      { filePath, size, maxSize },
    );
    this.name = "FileTooLargeError";
  }
}

/**
 * Parsing-related errors.
 */
export class ParseError extends SemanticaError {
  constructor(message: string, details?: any) {
    super(message, "PARSE_ERROR", details);
    this.name = "ParseError";
  }
}

/**
 * Unsupported language error.
 */
export class UnsupportedLanguageError extends ParseError {
  constructor(language: string) {
    super(`Unsupported language: ${language}`, { language });
    this.name = "UnsupportedLanguageError";
  }
}

/**
 * AST parsing error.
 */
export class ASTParseError extends ParseError {
  constructor(filePath: string, cause?: Error) {
    super(`Failed to parse AST for ${filePath}`, { filePath, cause });
    this.name = "ASTParseError";
  }
}

/**
 * Search-related errors.
 */
export class SearchError extends SemanticaError {
  constructor(message: string, details?: any) {
    super(message, "SEARCH_ERROR", details);
    this.name = "SearchError";
  }
}

/**
 * No results found error.
 */
export class NoResultsError extends SearchError {
  constructor(query: string) {
    super(`No results found for query: ${query}`, { query });
    this.name = "NoResultsError";
  }
}

/**
 * Configuration-related errors.
 */
export class ConfigError extends SemanticaError {
  constructor(message: string, details?: any) {
    super(message, "CONFIG_ERROR", details);
    this.name = "ConfigError";
  }
}

/**
 * Invalid configuration error.
 */
export class InvalidConfigError extends ConfigError {
  constructor(field: string, reason: string) {
    super(`Invalid configuration for ${field}: ${reason}`, { field, reason });
    this.name = "InvalidConfigError";
  }
}

/**
 * Merkle tree-related errors.
 */
export class MerkleError extends SemanticaError {
  constructor(message: string, details?: any) {
    super(message, "MERKLE_ERROR", details);
    this.name = "MerkleError";
  }
}

/**
 * Format error for logging.
 */
export function formatError(error: Error | any): string {
  if (error instanceof SemanticaError) {
    let message = `[${error.code}] ${error.message}`;
    if (error.details) {
      message += `\nDetails: ${JSON.stringify(error.details, null, 2)}`;
    }
    return message;
  }

  if (error instanceof Error) {
    return `${error.name}: ${error.message}\n${error.stack}`;
  }

  return String(error);
}

/**
 * Check if error is retryable.
 */
export function isRetryableError(error: Error | any): boolean {
  // Network errors are typically retryable
  if (error.code === "ECONNREFUSED" || error.code === "ETIMEDOUT") {
    return true;
  }

  // Temporary failures are retryable
  if (
    error.message?.includes("timeout") ||
    error.message?.includes("temporarily")
  ) {
    return true;
  }

  return false;
}
