/**
 * Base interface for language-specific parsers.
 * All parsers must implement this interface.
 */

import type { Language, ChunkType } from "../models/types.js";
import type { CodeChunk } from "../models/code-chunk.js";

/**
 * Parse result containing extracted chunks.
 */
export interface ParseResult {
  /** Extracted code chunks */
  chunks: CodeChunk[];

  /** Parsing errors (non-fatal) */
  errors: ParseError[];

  /** Parse metadata */
  metadata: ParseMetadata;
}

/**
 * Parse error (non-fatal).
 */
export interface ParseError {
  message: string;
  line?: number;
  column?: number;
}

/**
 * Parse metadata.
 */
export interface ParseMetadata {
  /** Total lines in file */
  totalLines: number;

  /** Total characters */
  totalChars: number;

  /** Chunk types found */
  chunkTypes: ChunkType[];

  /** Parse time in ms */
  parseTime: number;
}

/**
 * Parser interface.
 */
export interface Parser {
  /** Language this parser handles */
  readonly language: Language;

  /** Supported chunk types */
  readonly supportedChunkTypes: ChunkType[];

  /**
   * Parse file content into chunks.
   * @param content - File content to parse
   * @param filePath - File path (for metadata)
   * @param options - Parse options
   */
  parse(
    content: string,
    filePath: string,
    options?: ParseOptions,
  ): Promise<ParseResult>;

  /**
   * Check if parser can handle this file.
   * @param extension - File extension
   */
  canParse(extension: string): boolean;
}

/**
 * Parse options.
 */
export interface ParseOptions {
  /** Chunk types to extract (if not specified, extract all supported types) */
  chunkTypes?: ChunkType[];

  /** Maximum chunk size in tokens */
  maxChunkSize?: number;

  /** Include imports/dependencies */
  includeDependencies?: boolean;

  /** Extract keywords */
  extractKeywords?: boolean;
}

/**
 * Extracted code node from AST.
 */
export interface CodeNode {
  /** Node type (function, class, etc.) */
  type: ChunkType;

  /** Node name (symbol name) */
  name: string;

  /** Content of the node */
  content: string;

  /** Start position */
  startPosition: { line: number; column: number };

  /** End position */
  endPosition: { line: number; column: number };

  /** Children nodes (for nested structures) */
  children?: CodeNode[];

  /** Additional metadata */
  metadata?: Record<string, any>;
}

/**
 * Base parser class with common functionality.
 */
export abstract class BaseParser implements Parser {
  abstract readonly language: Language;
  abstract readonly supportedChunkTypes: ChunkType[];

  abstract parse(
    content: string,
    filePath: string,
    options?: ParseOptions,
  ): Promise<ParseResult>;

  abstract canParse(extension: string): boolean;

  /**
   * Count lines in content.
   */
  protected countLines(content: string): number {
    return content.split("\n").length;
  }

  /**
   * Extract line range from content.
   */
  protected extractLines(
    content: string,
    startLine: number,
    endLine: number,
  ): string {
    const lines = content.split("\n");
    return lines.slice(startLine - 1, endLine).join("\n");
  }

  /**
   * Get line and column from character offset.
   */
  protected getLineColumn(
    content: string,
    offset: number,
  ): {
    line: number;
    column: number;
  } {
    const before = content.substring(0, offset);
    const lines = before.split("\n");
    return {
      line: lines.length,
      column: lines[lines.length - 1].length,
    };
  }
}
