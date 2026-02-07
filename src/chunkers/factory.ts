/**
 * Chunker factory - creates chunker instances based on strategy.
 */

import type { Chunker } from "./base.js";
import { ChunkingStrategy } from "../models/types.js";
import { ASTSplitMergeChunker } from "./ast-split-merge.js";

/**
 * Create a chunker based on strategy.
 */
export function createChunker(strategy: ChunkingStrategy): Chunker {
  switch (strategy) {
    case ChunkingStrategy.AST_SPLIT_MERGE:
      return new ASTSplitMergeChunker();

    case ChunkingStrategy.AST_EXTRACT:
      // For now, use split-merge (extract is simpler, we'll add it later if needed)
      return new ASTSplitMergeChunker();

    case ChunkingStrategy.SLIDING_WINDOW:
      // For now, use split-merge as fallback
      return new ASTSplitMergeChunker();

    default:
      return new ASTSplitMergeChunker();
  }
}
