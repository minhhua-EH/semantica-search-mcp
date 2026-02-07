/**
 * CodeChunk model - represents a chunk of code with metadata and embeddings.
 * This is the core data structure stored in the vector database.
 */

import { ChunkType } from "./types.js";

/**
 * Code chunk metadata.
 */
export interface ChunkMetadata {
  // File information
  /** Relative path from project root */
  filePath: string;

  /** Absolute system path */
  absolutePath: string;

  /** Programming language */
  language: string;

  // Location information
  /** Starting line number (1-indexed) */
  startLine: number;

  /** Ending line number (1-indexed) */
  endLine: number;

  /** Starting character offset */
  startChar: number;

  /** Ending character offset */
  endChar: number;

  // Chunk information
  /** Type of chunk (function, class, file, etc.) */
  chunkType: ChunkType;

  /** Granularity strategy used */
  granularity: string;

  /** Parent chunk ID (for hierarchical chunks) */
  parentChunkId?: string;

  // Code semantics
  /** Symbol name (function/class name) */
  symbolName?: string;

  /** Symbol type (function, class, method, etc.) */
  symbolType?: string;

  /** Scope (public, private, etc.) */
  scope?: string;

  // Version control
  /** Git commit hash */
  gitHash?: string;

  /** Last modified timestamp */
  lastModified: Date;

  // Search optimization
  /** Extracted keywords for hybrid search */
  keywords: string[];

  /** Import/require statements */
  dependencies?: string[];

  /** Token count */
  tokenCount?: number;
}

/**
 * Code chunk with content, embedding, and metadata.
 */
export interface CodeChunk {
  /** Unique identifier (UUID) */
  id: string;

  /** Actual code content */
  content: string;

  /** Vector embedding (768 or 1024 dimensions) */
  embedding?: number[];

  /** Rich metadata */
  metadata: ChunkMetadata;
}

/**
 * Create a new code chunk.
 */
export function createCodeChunk(
  id: string,
  content: string,
  metadata: ChunkMetadata,
): CodeChunk {
  return {
    id,
    content,
    metadata,
  };
}

/**
 * Create code chunk with embedding.
 */
export function createCodeChunkWithEmbedding(
  id: string,
  content: string,
  embedding: number[],
  metadata: ChunkMetadata,
): CodeChunk {
  return {
    id,
    content,
    embedding,
    metadata,
  };
}

/**
 * Extract keywords from code content.
 */
export function extractKeywords(
  content: string,
  corpus: string[] = [],
): string[] {
  // Enhanced keyword extraction with TF-IDF support

  // Remove single-line comments
  let cleaned = content.replace(/\/\/.*$/gm, "");

  // Remove multi-line comments
  cleaned = cleaned.replace(/\/\*[\s\S]*?\*\//g, "");
  cleaned = cleaned.replace(/#.*$/gm, ""); // Ruby comments

  // Remove strings
  cleaned = cleaned.replace(/"[^"]*"/g, "");
  cleaned = cleaned.replace(/'[^']*'/g, "");
  cleaned = cleaned.replace(/`[^`]*`/g, "");

  // Extract words (identifiers), split camelCase and snake_case
  const rawWords = cleaned.match(/\b[a-zA-Z_][a-zA-Z0-9_]*\b/g) || [];

  // Split camelCase and snake_case
  const expandedWords: string[] = [];
  for (const word of rawWords) {
    // Split camelCase
    const camelSplit = word.replace(/([a-z])([A-Z])/g, "$1 $2");
    // Split snake_case
    const parts = camelSplit.split(/[_\s]+/);
    expandedWords.push(...parts.map((p) => p.toLowerCase()));
  }

  // Enhanced stop words for code
  const commonKeywords = new Set([
    "function",
    "class",
    "const",
    "let",
    "var",
    "if",
    "else",
    "elsif",
    "for",
    "while",
    "do",
    "switch",
    "case",
    "break",
    "continue",
    "return",
    "try",
    "catch",
    "finally",
    "throw",
    "new",
    "this",
    "def",
    "end",
    "module",
    "require",
    "include",
    "extend",
    "and",
    "or",
    "not",
    "the",
    "is",
    "are",
    "was",
    "were",
    "be",
  ]);

  const filtered = expandedWords
    .filter((w) => !commonKeywords.has(w))
    .filter((w) => w.length > 2);

  // Use TF-IDF if corpus is provided
  if (corpus.length > 0) {
    const uniqueWords = Array.from(new Set(filtered));
    const tfidfScores: Array<{ word: string; score: number }> = [];

    for (const word of uniqueWords) {
      const tf = filtered.filter((w) => w === word).length / filtered.length;
      const docsWithWord = corpus.filter((doc) =>
        doc.toLowerCase().includes(word),
      ).length;
      const idf = docsWithWord > 0 ? Math.log(corpus.length / docsWithWord) : 0;
      const tfidf = tf * idf;

      if (tfidf > 0) {
        tfidfScores.push({ word, score: tfidf });
      }
    }

    // Return top 10 by TF-IDF score
    return tfidfScores
      .sort((a, b) => b.score - a.score)
      .slice(0, 10)
      .map((item) => item.word);
  }

  // Fallback: Use frequency-based ranking
  const wordFreq = new Map<string, number>();
  for (const word of filtered) {
    wordFreq.set(word, (wordFreq.get(word) || 0) + 1);
  }

  return Array.from(wordFreq.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map((item) => item[0]);
}

/**
 * Extract dependencies from code content.
 */
export function extractDependencies(
  content: string,
  language: string,
): string[] {
  const dependencies: string[] = [];

  switch (language.toLowerCase()) {
    case "typescript":
    case "javascript":
      // Match import statements
      const importMatches = content.matchAll(
        /import\s+.*\s+from\s+['"]([^'"]+)['"]/g,
      );
      for (const match of importMatches) {
        dependencies.push(match[1]);
      }

      // Match require statements
      const requireMatches = content.matchAll(
        /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
      );
      for (const match of requireMatches) {
        dependencies.push(match[1]);
      }
      break;

    case "ruby":
      // Match require statements
      const rubyRequireMatches = content.matchAll(
        /require\s+['"]([^'"]+)['"]/g,
      );
      for (const match of rubyRequireMatches) {
        dependencies.push(match[1]);
      }

      // Match require_relative statements
      const relativeMatches = content.matchAll(
        /require_relative\s+['"]([^'"]+)['"]/g,
      );
      for (const match of relativeMatches) {
        dependencies.push(match[1]);
      }
      break;

    case "python":
      // Match import statements
      const pyImportMatches = content.matchAll(
        /(?:from\s+(\S+)\s+)?import\s+(\S+)/g,
      );
      for (const match of pyImportMatches) {
        if (match[1]) {
          dependencies.push(match[1]);
        }
        dependencies.push(match[2]);
      }
      break;
  }

  return Array.from(new Set(dependencies));
}

/**
 * Serialize chunk metadata to JSON-compatible object.
 */
export function serializeMetadata(
  metadata: ChunkMetadata,
): Record<string, any> {
  return {
    ...metadata,
    lastModified: metadata.lastModified.toISOString(),
  };
}

/**
 * Deserialize chunk metadata from JSON object.
 */
export function deserializeMetadata(data: Record<string, any>): ChunkMetadata {
  return {
    ...data,
    lastModified: new Date(data.lastModified),
  } as ChunkMetadata;
}

/**
 * Convert CodeChunk to vector format for storage.
 */
export function toVector(chunk: CodeChunk) {
  if (!chunk.embedding) {
    throw new Error("Chunk must have embedding to convert to vector");
  }

  return {
    id: chunk.id,
    vector: chunk.embedding,
    metadata: {
      ...serializeMetadata(chunk.metadata),
      content: chunk.content, // ← ADD CONTENT TO METADATA!
    },
  };
}

/**
 * Create CodeChunk from search result and content.
 */
export function fromSearchResult(
  id: string,
  content: string,
  metadata: Record<string, any>,
  embedding?: number[],
): CodeChunk {
  return {
    id,
    content,
    embedding,
    metadata: deserializeMetadata(metadata),
  };
}
