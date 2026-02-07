/**
 * Base chunker interface and types.
 * Defines how code is split into chunks for embedding.
 */

import type { CodeChunk } from "../models/code-chunk.js";
import type { CodeNode } from "../parsers/base.js";
import { ChunkType } from "../models/types.js";

/**
 * Internal node representation for chunking.
 * Extended from CodeNode with additional fields.
 */
export interface ChunkerNode {
  type: ChunkType;
  name: string;
  content: string;
  startLine: number;
  endLine: number;
  startChar: number;
  endChar: number;
  children?: ChunkerNode[];
  parent?: ChunkerNode;
}

/**
 * Chunking strategy options.
 */
export interface ChunkingOptions {
  maxTokens: number; // Maximum tokens per chunk
  minTokens?: number; // Minimum tokens per chunk (for merging)
  mergeSiblings?: boolean; // Merge small adjacent chunks
  preserveHierarchy?: boolean; // Keep parent-child relationships
}

/**
 * Chunker interface.
 * Implementations define different chunking strategies.
 */
export interface Chunker {
  /**
   * Chunk CodeNodes into optimized CodeChunks.
   * @param nodes - Parsed code nodes from parser
   * @param options - Chunking options
   * @param filePath - File path for metadata
   * @param language - Programming language
   */
  chunk(
    nodes: CodeNode[],
    options: ChunkingOptions,
    filePath: string,
    language: string,
  ): CodeChunk[];

  /**
   * Get chunker name.
   */
  getName(): string;
}

/**
 * Base abstract chunker with common utilities.
 */
export abstract class BaseChunker implements Chunker {
  abstract chunk(
    nodes: CodeNode[],
    options: ChunkingOptions,
    filePath: string,
    language: string,
  ): CodeChunk[];
  abstract getName(): string;

  /**
   * Convert CodeNode to ChunkerNode.
   */
  protected toChunkerNode(node: CodeNode): ChunkerNode {
    return {
      type: node.type,
      name: node.name,
      content: node.content,
      startLine: node.startPosition.line,
      endLine: node.endPosition.line,
      startChar: node.startPosition.column,
      endChar: node.endPosition.column,
      children: node.children?.map((c) => this.toChunkerNode(c)),
    };
  }

  /**
   * Create a CodeChunk from a ChunkerNode.
   */
  protected createChunk(
    node: ChunkerNode,
    filePath: string,
    language: string,
    chunkType?: ChunkType,
  ): CodeChunk {
    return {
      id: this.generateChunkId(node, filePath),
      content: node.content,
      metadata: {
        filePath,
        absolutePath: "", // Will be set by caller
        language,
        startLine: node.startLine,
        endLine: node.endLine,
        startChar: node.startChar,
        endChar: node.endChar,
        chunkType: chunkType || node.type, // Use provided type or node's type
        granularity: this.getName(), // Chunker strategy name
        symbolName: node.name,
        symbolType: node.type.toString(),
        keywords: this.extractKeywords(node.content),
        lastModified: new Date(),
      },
    };
  }

  /**
   * Generate unique chunk ID.
   */
  protected generateChunkId(node: ChunkerNode, filePath: string): string {
    const hash = this.simpleHash(
      `${filePath}:${node.startLine}:${node.endLine}`,
    );
    return `chunk-${hash}`;
  }

  /**
   * Simple hash function.
   */
  protected simpleHash(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash).toString(36);
  }

  /**
   * Extract keywords from content (simple implementation).
   */
  protected extractKeywords(content: string): string[] {
    // Remove special characters and split
    const words = content
      .replace(/[^\w\s]/g, " ")
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length > 2);

    // Remove duplicates and common stop words
    const stopWords = new Set([
      "the",
      "and",
      "for",
      "are",
      "but",
      "not",
      "you",
      "all",
      "can",
      "her",
      "was",
      "one",
      "our",
      "out",
      "def",
      "end",
      "return",
      "function",
    ]);

    return Array.from(new Set(words))
      .filter((w) => !stopWords.has(w))
      .slice(0, 10);
  }
}
