/**
 * Indexing service - orchestrates the full indexing workflow.
 * Discover → Parse → Chunk → Embed → Store
 */

import type { Config } from "../config/schema.js";
import { FileService, FileInfo } from "./file.service.js";
import { createParser } from "../parsers/factory.js";
import { createEmbeddingProvider } from "../providers/embedding/factory.js";
import { createVectorDBProvider } from "../providers/vectordb/factory.js";
import type { EmbeddingProvider } from "../providers/embedding/base.js";
import type { VectorDBProvider } from "../providers/vectordb/base.js";
import type { CodeChunk } from "../models/code-chunk.js";
import { toVector } from "../models/code-chunk.js";
import { getLogger } from "../utils/logger.js";
import { IndexingError } from "../utils/errors.js";
import { sleep } from "../utils/async.js";
import { ProgressTracker, logProgress } from "../utils/progress.js";
import pLimit from "p-limit";

const logger = getLogger();

/**
 * Indexing progress callback.
 */
export interface IndexingProgress {
  phase: "discovery" | "parsing" | "embedding" | "storing";
  current: number;
  total: number;
  message: string;
}

/**
 * Indexing result.
 */
export interface IndexingResult {
  success: boolean;
  totalFiles: number;
  totalChunks: number;
  totalEmbeddings: number;
  errors: Array<{ file: string; error: string }>;
  duration: number;
}

/**
 * Indexing service.
 */
export class IndexingService {
  private config: Config;
  private fileService: FileService;
  private embeddingProvider: EmbeddingProvider;
  private vectorDBProvider: VectorDBProvider;

  constructor(config: Config, projectRoot: string) {
    this.config = config;

    // Initialize services
    this.fileService = new FileService(
      projectRoot,
      config.indexing,
      config.performance || {
        maxFileSize: "1MB",
        maxConcurrent: 10,
        cacheEnabled: true,
        cacheTTL: 3600,
        batchDelay: 500,
      },
    );

    this.embeddingProvider = createEmbeddingProvider(config.embedding);
    this.vectorDBProvider = createVectorDBProvider(config.vectordb);
  }

  /**
   * Index entire codebase.
   */
  async indexCodebase(
    onProgress?: (progress: IndexingProgress) => void,
  ): Promise<IndexingResult> {
    const startTime = Date.now();
    const errors: Array<{ file: string; error: string }> = [];
    let totalChunks = 0;
    let totalEmbeddings = 0;
    let files: any[] = []; // Declare outside try for catch block access

    // Create progress tracker
    const progressTracker = new ProgressTracker();

    try {
      // Phase 1: Discover files
      logger.info("Phase 1: Discovering files");
      logProgress("📂 [DISCOVERY] Scanning project files...");

      onProgress?.({
        phase: "discovery",
        current: 0,
        total: 0,
        message: "Discovering files...",
      });

      files = await this.fileService.discoverFiles();
      logger.info(`Discovered ${files.length} files`);
      logProgress(`✅ [DISCOVERY] Found ${files.length} files to index`);

      // Phase 2: Parse files and extract chunks
      logger.info("Phase 2: Parsing files");
      logProgress(
        `\n🔍 [PARSING] Extracting code chunks from ${files.length} files...`,
      );

      const allChunks: CodeChunk[] = [];

      for (let i = 0; i < files.length; i++) {
        const file = files[i];

        // Log progress every 10 files or on special intervals
        if (
          i % 10 === 0 ||
          i === files.length - 1 ||
          progressTracker.shouldUpdate()
        ) {
          const stats = progressTracker.getStats(
            "parsing",
            i + 1,
            files.length,
          );
          logProgress(
            `   ${stats.percentage.toFixed(1)}% (${i + 1}/${files.length}) | ${stats.speed?.toFixed(1)} files/s | ETA: ${progressTracker.formatDuration(stats.eta || 0)}`,
          );
        }

        onProgress?.({
          phase: "parsing",
          current: i + 1,
          total: files.length,
          message: `Parsing ${file.relativePath}`,
        });

        try {
          const chunks = await this.parseFile(file);
          allChunks.push(...chunks);
          totalChunks += chunks.length;

          logger.debug(`Parsed ${file.relativePath}: ${chunks.length} chunks`);
        } catch (error) {
          const errorMsg =
            error instanceof Error ? error.message : String(error);
          logger.error(`Failed to parse ${file.relativePath}`, error);
          errors.push({
            file: file.relativePath,
            error: errorMsg,
          });
        }
      }

      logger.info(`Extracted ${totalChunks} chunks from ${files.length} files`);
      logProgress(`✅ [PARSING] Complete! Extracted ${totalChunks} chunks`);

      // Phase 3: Generate embeddings with parallel processing
      logger.info("Phase 3: Generating embeddings");
      logProgress(
        `\n🧠 [EMBEDDING] Generating embeddings for ${totalChunks} chunks...`,
      );

      const chunksWithEmbeddings: CodeChunk[] = [];

      // Parallel batch processing with concurrency limit
      const batchSize = this.config.embedding.batchSize;
      const concurrency = this.config.embedding.concurrency || 3;
      const totalBatches = Math.ceil(allChunks.length / batchSize);

      logProgress(
        `   Processing ${totalBatches} batches with concurrency=${concurrency}`,
      );

      // Create batches
      const batches: Array<{ index: number; chunks: CodeChunk[] }> = [];
      for (let i = 0; i < allChunks.length; i += batchSize) {
        batches.push({
          index: i,
          chunks: allChunks.slice(i, i + batchSize),
        });
      }

      // Process batches in parallel with limit
      const limit = pLimit(concurrency);
      let completedBatches = 0;

      const embedPromises = batches.map((batch) =>
        limit(async () => {
          try {
            const embeddings = await this.embeddingProvider.embedBatch(
              batch.chunks.map((c) => c.content),
            );

            // Attach embeddings
            const embeddedChunks: CodeChunk[] = [];
            for (let j = 0; j < batch.chunks.length; j++) {
              batch.chunks[j].embedding = embeddings[j];
              embeddedChunks.push(batch.chunks[j]);
            }

            // Update progress
            completedBatches++;
            const chunksProcessed = Math.min(
              completedBatches * batchSize,
              allChunks.length,
            );

            if (
              completedBatches % 10 === 0 ||
              completedBatches === totalBatches
            ) {
              const stats = progressTracker.getStats(
                "embedding",
                chunksProcessed,
                allChunks.length,
              );
              logProgress(
                `   ${stats.percentage.toFixed(1)}% | Batch ${completedBatches}/${totalBatches} | ${stats.speed?.toFixed(0)} chunks/s`,
              );
            }

            onProgress?.({
              phase: "embedding",
              current: chunksProcessed,
              total: allChunks.length,
              message: `Generating embeddings (${chunksProcessed}/${allChunks.length})`,
            });

            return embeddedChunks;
          } catch (error) {
            logger.error(`Failed to generate embeddings for batch`, error);
            errors.push({
              file: `batch-${batch.index}`,
              error: error instanceof Error ? error.message : String(error),
            });
            return [];
          }
        }),
      );

      // Wait for all batches to complete
      const allEmbeddedChunks = await Promise.all(embedPromises);

      // Flatten results
      for (const embeddedChunks of allEmbeddedChunks) {
        chunksWithEmbeddings.push(...embeddedChunks);
        totalEmbeddings += embeddedChunks.length;
      }

      const embeddingSuccessRate =
        totalChunks > 0 ? (totalEmbeddings / totalChunks) * 100 : 0;
      logger.info(`Generated ${totalEmbeddings} embeddings`);
      logProgress(
        `✅ [EMBEDDING] Complete! ${totalEmbeddings}/${totalChunks} chunks (${embeddingSuccessRate.toFixed(1)}% success)`,
      );

      // Phase 4: Store in vector database
      logger.info("Phase 4: Storing vectors");
      logProgress(
        `\n💾 [STORING] Saving ${totalEmbeddings} vectors to database...`,
      );

      // Ensure collection exists
      await this.ensureCollection();

      // Store in batches
      const storeBatchSize = 100;
      for (let i = 0; i < chunksWithEmbeddings.length; i += storeBatchSize) {
        const batch = chunksWithEmbeddings.slice(i, i + storeBatchSize);

        onProgress?.({
          phase: "storing",
          current: i + batch.length,
          total: chunksWithEmbeddings.length,
          message: `Storing vectors (${i + batch.length}/${chunksWithEmbeddings.length})`,
        });

        try {
          const vectors = batch.map((chunk) => toVector(chunk));
          await this.vectorDBProvider.insert(
            this.config.vectordb.collectionName,
            vectors,
          );

          logger.debug(`Stored ${vectors.length} vectors`);
        } catch (error) {
          logger.error(`Failed to store batch`, error);
          errors.push({
            file: `store-batch-${i}`,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }

      const duration = Date.now() - startTime;

      // Calculate success rate
      const successRate = totalChunks > 0 ? totalEmbeddings / totalChunks : 0;
      const isSuccess = successRate >= 0.8; // Success if 80%+ chunks embedded

      // Log final summary to stderr (visible in MCP mode)
      logProgress(`✅ [STORING] Complete! All vectors stored`);
      logProgress(`\n${"=".repeat(80)}`);
      logProgress(`🎉 INDEXING COMPLETE!`);
      logProgress(`${"=".repeat(80)}`);
      logProgress(`📊 Summary:`);
      logProgress(`   Files indexed: ${files.length}`);
      logProgress(`   Chunks created: ${totalChunks}`);
      logProgress(`   Embeddings: ${totalEmbeddings}/${totalChunks}`);
      logProgress(`   Success rate: ${(successRate * 100).toFixed(1)}%`);
      logProgress(`   Duration: ${(duration / 1000).toFixed(1)}s`);
      logProgress(
        `   Speed: ${(files.length / (duration / 1000)).toFixed(1)} files/s`,
      );

      if (errors.length > 0) {
        logProgress(`   ⚠️  Errors: ${errors.length}`);
      } else {
        logProgress(`   ✅ Zero errors!`);
      }

      logProgress(`${"=".repeat(80)}\n`);

      logger.info(`Indexing complete in ${duration}ms`, {
        files: files.length,
        chunks: totalChunks,
        embeddings: totalEmbeddings,
        successRate: `${(successRate * 100).toFixed(1)}%`,
        errors: errors.length,
      });

      return {
        success: isSuccess,
        totalFiles: files.length,
        totalChunks,
        totalEmbeddings,
        errors,
        duration,
      };
    } catch (error) {
      // Log to stderr for debugging (won't interfere with MCP protocol)
      console.error("[INDEXING ERROR] Caught exception in main catch block");
      console.error("[INDEXING ERROR] Error type:", error?.constructor?.name);
      console.error(
        "[INDEXING ERROR] Error message:",
        error instanceof Error ? error.message : String(error),
      );
      console.error("[INDEXING ERROR] Full error:", error);
      console.error(
        "[INDEXING ERROR] Stats at failure - files:",
        files?.length,
        "chunks:",
        totalChunks,
        "embeddings:",
        totalEmbeddings,
      );

      logger.error("Indexing failed", error);
      throw new IndexingError(
        "Failed to index codebase",
        error instanceof Error ? { cause: error } : { error },
      );
    } finally {
      // Always cleanup resources
      try {
        logger.debug("Cleaning up resources");
        await Promise.all([
          this.embeddingProvider.close(),
          this.vectorDBProvider.close(),
        ]);
        logger.debug("Resources cleaned up successfully");
      } catch (cleanupError) {
        logger.warn("Error during cleanup", cleanupError);
        // Don't throw - cleanup errors shouldn't fail the operation
      }
    }
  }

  /**
   * Parse a single file into chunks.
   */
  private async parseFile(file: FileInfo): Promise<CodeChunk[]> {
    if (!file.language) {
      logger.debug(`Skipping ${file.relativePath}: unknown language`);
      return [];
    }

    // Create parser for language
    const parser = createParser(file.language);

    // Read file content
    const content = this.fileService.readFile(file.absolutePath);

    // Parse to chunks
    const result = await parser.parse(content, file.relativePath);

    // Update chunk metadata with correct paths
    for (const chunk of result.chunks) {
      chunk.metadata.absolutePath = file.absolutePath;
      chunk.metadata.filePath = file.relativePath;
      chunk.metadata.lastModified = file.lastModified;
    }

    return result.chunks;
  }

  /**
   * Ensure vector database collection exists.
   */
  private async ensureCollection(): Promise<void> {
    const collectionName = this.config.vectordb.collectionName;

    try {
      // Connect to vector DB
      await this.vectorDBProvider.connect();

      // Check if collection exists
      const exists =
        await this.vectorDBProvider.collectionExists(collectionName);

      if (!exists) {
        logger.info(`Creating collection: ${collectionName}`);
        await this.vectorDBProvider.createCollection(
          collectionName,
          this.config.embedding.dimensions,
        );
      } else {
        logger.info(`Collection already exists: ${collectionName}`);
      }
    } catch (error) {
      logger.error("Failed to ensure collection", error);
      throw new IndexingError(
        "Failed to create or connect to collection",
        error instanceof Error ? { cause: error } : { error },
      );
    }
  }

  /**
   * Get indexing statistics.
   */
  async getStats(): Promise<{
    collectionExists: boolean;
    vectorCount: number;
    dimensions: number;
  }> {
    const collectionName = this.config.vectordb.collectionName;

    try {
      await this.vectorDBProvider.connect();

      const exists =
        await this.vectorDBProvider.collectionExists(collectionName);

      if (!exists) {
        return {
          collectionExists: false,
          vectorCount: 0,
          dimensions: 0,
        };
      }

      const stats = await this.vectorDBProvider.getStats(collectionName);

      return {
        collectionExists: true,
        vectorCount: stats.count,
        dimensions: stats.dimensions,
      };
    } catch (error) {
      logger.error("Failed to get stats", error);
      throw new IndexingError(
        "Failed to get indexing statistics",
        error instanceof Error ? { cause: error } : { error },
      );
    } finally {
      try {
        await this.vectorDBProvider.close();
      } catch (cleanupError) {
        logger.warn("Error during cleanup", cleanupError);
      }
    }
  }

  /**
   * Clear all indexed data.
   */
  async clearIndex(): Promise<void> {
    const collectionName = this.config.vectordb.collectionName;

    try {
      await this.vectorDBProvider.connect();

      const exists =
        await this.vectorDBProvider.collectionExists(collectionName);

      if (exists) {
        logger.info(`Deleting collection: ${collectionName}`);
        await this.vectorDBProvider.deleteCollection(collectionName);
      }
    } catch (error) {
      logger.error("Failed to clear index", error);
      throw new IndexingError(
        "Failed to clear index",
        error instanceof Error ? { cause: error } : { error },
      );
    } finally {
      try {
        await this.vectorDBProvider.close();
      } catch (cleanupError) {
        logger.warn("Error during cleanup", cleanupError);
      }
    }
  }
}
