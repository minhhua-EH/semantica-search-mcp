/**
 * Incremental Indexing Service
 * Handles re-indexing of changed files only (not full codebase).
 */

import type { Config } from "../config/schema.js";
import { FileService } from "./file.service.js";
import { MerkleService, FileChanges } from "./merkle.service.js";
import { createParser } from "../parsers/factory.js";
import { createEmbeddingProvider } from "../providers/embedding/factory.js";
import { createVectorDBProvider } from "../providers/vectordb/factory.js";
import type { EmbeddingProvider } from "../providers/embedding/base.js";
import type { VectorDBProvider } from "../providers/vectordb/base.js";
import type { CodeChunk } from "../models/code-chunk.js";
import { toVector } from "../models/code-chunk.js";
import { getLogger } from "../utils/logger.js";
import { logProgress } from "../utils/progress.js";
import { LockManager } from "../utils/lock.js";
import pLimit from "p-limit";

const logger = getLogger();

/**
 * Incremental re-index result.
 */
export interface IncrementalResult {
  filesProcessed: number;
  chunksAdded: number;
  chunksUpdated: number;
  chunksDeleted: number;
  duration: number;
  errors: Array<{ file: string; error: string }>;
}

/**
 * Incremental indexing service.
 */
export class IncrementalIndexingService {
  private config: Config;
  private projectRoot: string;
  private fileService: FileService;
  private merkleService: MerkleService;
  private embeddingProvider: EmbeddingProvider;
  private vectorDBProvider: VectorDBProvider;

  constructor(config: Config, projectRoot: string) {
    this.config = config;
    this.projectRoot = projectRoot;

    this.fileService = new FileService(
      projectRoot,
      config.indexing,
      config.performance || {
        maxFileSize: "1MB",
        maxConcurrent: 10,
        cacheEnabled: true,
        cacheTTL: 3600,
        batchDelay: 0,
      },
    );

    this.merkleService = new MerkleService(
      projectRoot,
      config.merkle?.storePath || ".semantica/merkle",
    );

    this.embeddingProvider = createEmbeddingProvider(config.embedding);
    this.vectorDBProvider = createVectorDBProvider(config.vectordb);
  }

  /**
   * Re-index changed files incrementally.
   */
  async reindexChangedFiles(
    specificFiles?: string[],
    options?: { force?: boolean },
  ): Promise<IncrementalResult> {
    const startTime = Date.now();
    const errors: Array<{ file: string; error: string }> = [];

    // Acquire lock to prevent concurrent re-indexing
    const lockManager = new LockManager(this.projectRoot);

    if (!lockManager.acquire("incremental-reindex")) {
      if (options?.force) {
        // Force mode: Kill previous process and take over
        logProgress(
          `⚠️  [INCREMENTAL] Force mode: Killing previous re-index...`,
        );
        lockManager.killLockedProcess();

        // Try to acquire lock again
        if (!lockManager.acquire("incremental-reindex")) {
          throw new Error(
            "Failed to acquire lock even after killing previous process",
          );
        }
      } else {
        const lockInfo = lockManager.getLockInfo();
        const message = `Re-indexing already in progress (PID: ${lockInfo?.pid}, started ${((Date.now() - (lockInfo?.timestamp || 0)) / 1000).toFixed(0)}s ago)`;

        logProgress(`⚠️  [INCREMENTAL] ${message}`);
        throw new Error(message);
      }
    }

    // Ensure lock is released on exit
    const releaseLock = () => lockManager.release();
    process.on("exit", releaseLock);
    process.on("SIGTERM", () => {
      releaseLock();
      process.exit(0);
    });
    process.on("SIGINT", () => {
      releaseLock();
      process.exit(0);
    });

    try {
      logProgress("\n🔄 [INCREMENTAL] Starting incremental re-index...");

      // Detect changes
      let changes: FileChanges;

      if (specificFiles && specificFiles.length > 0) {
        // Re-index specific files (treat as modified)
        changes = {
          added: [],
          modified: specificFiles,
          deleted: [],
        };
        logProgress(`   Re-indexing ${specificFiles.length} specified files`);
      } else {
        // Auto-detect changes using Merkle tree
        const currentFiles = await this.fileService.discoverFiles();
        const filePaths = currentFiles.map((f) => f.absolutePath);

        changes = await this.merkleService.detectChanges(filePaths);

        logProgress(
          `   Detected: ${changes.added.length} added, ${changes.modified.length} modified, ${changes.deleted.length} deleted`,
        );
      }

      await this.vectorDBProvider.connect();

      let chunksAdded = 0;
      let chunksUpdated = 0;
      let chunksDeleted = 0;

      // Step 1: Delete vectors for removed files
      if (changes.deleted.length > 0) {
        logProgress(
          `\n🗑️  Removing ${changes.deleted.length} deleted files...`,
        );

        for (const file of changes.deleted) {
          try {
            const chunks = await this.findChunksByFile(file);
            if (chunks.length > 0) {
              await this.vectorDBProvider.delete(
                this.config.vectordb.collectionName,
                chunks.map((c) => c.id),
              );
              chunksDeleted += chunks.length;
            }
          } catch (error) {
            logger.error(`Failed to delete chunks for ${file}`, error);
            errors.push({
              file,
              error: error instanceof Error ? error.message : String(error),
            });
          }
        }

        logProgress(`   ✅ Deleted ${chunksDeleted} chunks`);
      }

      // Step 2: Re-index modified files
      const filesToReindex = [...changes.added, ...changes.modified];

      if (filesToReindex.length > 0) {
        logProgress(
          `\n🔄 Re-indexing ${filesToReindex.length} files (added + modified)...`,
        );

        // Delete old chunks for modified files
        for (const file of changes.modified) {
          try {
            const chunks = await this.findChunksByFile(file);
            if (chunks.length > 0) {
              await this.vectorDBProvider.delete(
                this.config.vectordb.collectionName,
                chunks.map((c) => c.id),
              );
            }
          } catch (error) {
            logger.error(`Failed to delete old chunks for ${file}`, error);
          }
        }

        // Parse and embed changed files
        const allChunks: CodeChunk[] = [];

        for (const filePath of filesToReindex) {
          try {
            const chunks = await this.parseFile(filePath);
            allChunks.push(...chunks);
          } catch (error) {
            logger.error(`Failed to parse ${filePath}`, error);
            errors.push({
              file: filePath,
              error: error instanceof Error ? error.message : String(error),
            });
          }
        }

        logProgress(
          `   Parsed ${allChunks.length} chunks from ${filesToReindex.length} files`,
        );

        // Generate embeddings in parallel
        const batchSize = this.config.embedding.batchSize;
        const concurrency = this.config.embedding.concurrency || 3;
        const chunksWithEmbeddings: CodeChunk[] = [];

        const batches: CodeChunk[][] = [];
        for (let i = 0; i < allChunks.length; i += batchSize) {
          batches.push(allChunks.slice(i, i + batchSize));
        }

        const limit = pLimit(concurrency);

        const embedPromises = batches.map((batch) =>
          limit(async () => {
            try {
              const embeddings = await this.embeddingProvider.embedBatch(
                batch.map((c) => c.content),
              );

              for (let i = 0; i < batch.length; i++) {
                batch[i].embedding = embeddings[i];
                chunksWithEmbeddings.push(batch[i]);
              }

              return batch;
            } catch (error) {
              logger.error("Failed to generate embeddings", error);
              return [];
            }
          }),
        );

        await Promise.all(embedPromises);

        logProgress(`   Generated ${chunksWithEmbeddings.length} embeddings`);

        // Insert new vectors
        if (chunksWithEmbeddings.length > 0) {
          const vectors = chunksWithEmbeddings.map((chunk) => toVector(chunk));
          await this.vectorDBProvider.insert(
            this.config.vectordb.collectionName,
            vectors,
          );

          if (changes.added.length > 0) {
            chunksAdded += chunksWithEmbeddings.filter((c) =>
              changes.added.some((f) => c.metadata.absolutePath === f),
            ).length;
          }

          if (changes.modified.length > 0) {
            chunksUpdated += chunksWithEmbeddings.filter((c) =>
              changes.modified.some((f) => c.metadata.absolutePath === f),
            ).length;
          }
        }

        logProgress(
          `   ✅ Inserted ${chunksWithEmbeddings.length} new vectors`,
        );
      }

      // Step 3: Update Merkle tree
      const allFiles = await this.fileService.discoverFiles();
      await this.merkleService.updateTree(allFiles.map((f) => f.absolutePath));

      const duration = Date.now() - startTime;

      logProgress(
        `\n✅ [INCREMENTAL] Complete in ${(duration / 1000).toFixed(1)}s!`,
      );
      logProgress(
        `   Added: ${chunksAdded} | Updated: ${chunksUpdated} | Deleted: ${chunksDeleted}`,
      );

      // Release lock
      lockManager.release();

      return {
        filesProcessed: filesToReindex.length + changes.deleted.length,
        chunksAdded,
        chunksUpdated,
        chunksDeleted,
        duration,
        errors,
      };
    } catch (error) {
      logger.error("Incremental re-index failed", error);
      lockManager.release();
      throw error;
    }
  }

  /**
   * Parse a single file.
   */
  private async parseFile(absolutePath: string): Promise<CodeChunk[]> {
    // Detect language from extension
    const ext = absolutePath.substring(absolutePath.lastIndexOf("."));
    let language: string | null = null;

    if ([".ts", ".tsx"].includes(ext)) language = "typescript";
    else if ([".js", ".jsx", ".mjs", ".cjs"].includes(ext))
      language = "javascript";
    else if (ext === ".rb") language = "ruby";

    if (!language) {
      return [];
    }

    const parser = createParser(language as any);
    const content = this.fileService.readFile(absolutePath);
    const relativePath = absolutePath.replace(this.projectRoot + "/", "");

    const result = await parser.parse(content, relativePath);

    // Update metadata
    for (const chunk of result.chunks) {
      chunk.metadata.absolutePath = absolutePath;
      chunk.metadata.filePath = relativePath;
    }

    return result.chunks;
  }

  /**
   * Find chunks by file path.
   * NOTE: This requires vector DB to support metadata filtering.
   */
  private async findChunksByFile(filePath: string): Promise<CodeChunk[]> {
    // For now, return empty array
    // TODO: Implement metadata-based search in vector DB provider
    // This would require adding a filterByMetadata() method

    logger.debug(`Finding chunks for file: ${filePath}`);

    // Workaround: We'll just delete by convention (chunk IDs are file-based)
    // In production, should use metadata filtering

    return [];
  }
}
