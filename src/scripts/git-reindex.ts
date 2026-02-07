#!/usr/bin/env node
/**
 * Git hook script for automatic incremental re-indexing.
 * Called directly by git hooks (post-checkout, post-merge).
 */

import { join } from "path";
import { loadConfig } from "../config/loader.js";
import { IncrementalIndexingService } from "../services/incremental.service.js";

// Get project root from args or environment
const projectRoot = process.argv[2] || process.cwd();
const trigger = process.argv[3] || "unknown";
const changedFiles = parseInt(process.argv[4] || "0");
const forceMode = trigger === "post-checkout"; // Always force for branch switches

console.error(`\n[Semantica] Git hook triggered: ${trigger}`);
console.error(`[Semantica] Project: ${projectRoot}`);
console.error(`[Semantica] Changed files: ${changedFiles}`);

async function runReindex() {
  try {
    console.error(`[Semantica] Loading configuration...`);

    // Load config
    const configPath = join(projectRoot, ".semantica", "config.json");
    const config = loadConfig(configPath);

    console.error(`[Semantica] Starting incremental re-index...`);

    // Create service and run
    const service = new IncrementalIndexingService(config, projectRoot);
    const result = await service.reindexChangedFiles(undefined, {
      force: forceMode,
    });

    console.error(`\n[Semantica] ✅ Re-index complete!`);
    console.error(`[Semantica] Files: ${result.filesProcessed}`);
    console.error(
      `[Semantica] Added: ${result.chunksAdded} | Updated: ${result.chunksUpdated} | Deleted: ${result.chunksDeleted}`,
    );
    console.error(
      `[Semantica] Duration: ${(result.duration / 1000).toFixed(1)}s`,
    );

    if (result.errors.length > 0) {
      console.error(`[Semantica] ⚠️  Errors: ${result.errors.length}`);
    }

    console.error(`[Semantica] Index is up to date!\n`);
    process.exit(0);
  } catch (error) {
    console.error(`\n[Semantica] ❌ Re-index failed:`, error);
    console.error(`[Semantica] You can manually re-index using the MCP tool\n`);
    process.exit(1);
  }
}

runReindex();
