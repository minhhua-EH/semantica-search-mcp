/**
 * Pre-flight checks and estimates for indexing operations.
 */

import { existsSync } from "fs";
import type { Config } from "../config/schema.js";
import { Language } from "../models/types.js";
import { FileService } from "../services/file.service.js";
import { createEmbeddingProvider } from "../providers/embedding/factory.js";
import { createVectorDBProvider } from "../providers/vectordb/factory.js";

export interface PreflightEstimate {
  filesCount: number;
  estimatedChunks: number;
  estimatedTime: string; // e.g., "12-13 minutes"
  estimatedCost: string; // e.g., "$0.12" or "FREE"
  checks: {
    configExists: boolean;
    vectorDBHealthy: boolean;
    embeddingProviderHealthy: boolean;
    diskSpaceAvailable: boolean;
  };
  warnings: string[];
}

/**
 * Perform pre-flight checks and estimate indexing time/cost.
 */
export async function estimateIndexing(
  projectPath: string,
  config: Config,
): Promise<PreflightEstimate> {
  const warnings: string[] = [];

  // 1. Count files to be indexed
  const fileService = new FileService(
    projectPath,
    config.indexing,
    config.performance || {
      maxFileSize: "1MB",
      maxConcurrent: 10,
      cacheEnabled: false,
      cacheTTL: 3600,
      batchDelay: 0,
    },
  );

  const files = await fileService.discoverFiles();
  const filesCount = files.length;

  // 2. Estimate chunks (based on language)
  const avgChunksPerFile = estimateChunksPerFile(config);
  const estimatedChunks = Math.round(filesCount * avgChunksPerFile);

  // 3. Estimate time (based on provider and concurrency)
  const timeEstimate = estimateTime(
    filesCount,
    estimatedChunks,
    config.embedding,
  );

  // 4. Estimate cost
  const costEstimate = estimateCost(
    estimatedChunks,
    config.embedding.provider,
    config.embedding.model,
  );

  // 5. Health checks
  const checks = {
    configExists: existsSync(`${projectPath}/.semantica/config.json`),
    vectorDBHealthy: await checkVectorDBHealth(config),
    embeddingProviderHealthy: await checkEmbeddingProviderHealth(config),
    diskSpaceAvailable: true, // TODO: Implement disk space check
  };

  // 6. Generate warnings
  if (filesCount === 0) {
    warnings.push("No files found to index - check include/exclude patterns");
  }
  if (filesCount > 10000) {
    warnings.push(
      `Large codebase (${filesCount.toLocaleString()} files) - indexing may take ${timeEstimate}`,
    );
  }
  if (!checks.vectorDBHealthy) {
    warnings.push(
      "Vector database not accessible - please start Milvus/Qdrant",
    );
  }
  if (!checks.embeddingProviderHealthy) {
    warnings.push(
      "Embedding provider not accessible - check Ollama/OpenAI connection",
    );
  }

  return {
    filesCount,
    estimatedChunks,
    estimatedTime: timeEstimate,
    estimatedCost: costEstimate,
    checks,
    warnings,
  };
}

/**
 * Estimate average chunks per file based on languages.
 */
function estimateChunksPerFile(config: Config): number {
  const languages = config.project?.languages || [];

  // Ruby: ~3-4 chunks per file (simpler structure)
  // TypeScript/JavaScript: ~6-9 chunks per file (more exports)
  // Python: ~4-5 chunks per file
  // Go: ~3-4 chunks per file

  if (
    languages.includes(Language.TYPESCRIPT) ||
    languages.includes(Language.JAVASCRIPT)
  ) {
    return 6.0;
  } else if (languages.includes(Language.RUBY)) {
    return 3.5;
  } else if (languages.includes(Language.PYTHON)) {
    return 4.5;
  } else {
    return 4.0; // Default
  }
}

/**
 * Estimate indexing time based on files, chunks, and settings.
 */
function estimateTime(
  files: number,
  chunks: number,
  embeddingConfig: any,
): string {
  const provider = embeddingConfig.provider;
  const concurrency = embeddingConfig.concurrency || 3;

  // Base rates (chunks per second)
  let baseRate = 0;
  if (provider === "ollama") {
    baseRate = 28; // Ollama: ~28 chunks/s
  } else if (provider === "openai") {
    // OpenAI varies by concurrency
    if (concurrency >= 5) baseRate = 85;
    else if (concurrency === 4) baseRate = 70;
    else if (concurrency === 3) baseRate = 50;
    else baseRate = 35;
  }

  // Estimate embedding time (this is the bottleneck)
  const embeddingTime = chunks / baseRate;

  // Add overhead (parsing only - storing is too fast to estimate accurately)
  const parsingTime = files / 700; // ~700 files/s parsing
  // Note: Storing is very fast (~10-15s even for 30K+ vectors) but hard to estimate
  // because it depends on Milvus load. Skip it to avoid misleading estimates.
  const overhead = parsingTime + 10; // +10s buffer for discovery + storing

  const totalSeconds = embeddingTime + overhead;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.floor(totalSeconds % 60);

  if (minutes < 1) {
    return `~${seconds} seconds`;
  } else if (minutes < 2) {
    return `~1-2 minutes`;
  } else {
    return `~${minutes}-${minutes + 1} minutes`;
  }
}

/**
 * Estimate cost based on provider and chunks.
 */
function estimateCost(chunks: number, provider: string, model: string): string {
  if (provider === "ollama") {
    return "FREE (local Ollama)";
  }

  if (provider === "openai") {
    const avgTokensPerChunk = 175;
    const totalTokens = chunks * avgTokensPerChunk;

    // OpenAI pricing (per 1M tokens)
    const pricing: Record<string, number> = {
      "text-embedding-3-small": 0.02,
      "text-embedding-3-large": 0.13,
      "text-embedding-ada-002": 0.1,
    };

    const costPerToken = (pricing[model] || 0.02) / 1_000_000;
    const cost = totalTokens * costPerToken;

    if (cost < 0.01) {
      return `~$${cost.toFixed(6)} (<1 cent)`;
    } else {
      return `~$${cost.toFixed(4)}`;
    }
  }

  return "Unknown";
}

/**
 * Check if vector DB is healthy.
 */
async function checkVectorDBHealth(config: Config): Promise<boolean> {
  try {
    const provider = createVectorDBProvider(config.vectordb);
    await provider.connect();
    const healthy = await provider.healthCheck();
    await provider.close();
    return healthy;
  } catch (error) {
    return false;
  }
}

/**
 * Check if embedding provider is healthy.
 */
async function checkEmbeddingProviderHealth(config: Config): Promise<boolean> {
  try {
    const provider = createEmbeddingProvider(config.embedding);
    const healthy = await provider.healthCheck();
    await provider.close();
    return healthy;
  } catch (error) {
    return false;
  }
}
