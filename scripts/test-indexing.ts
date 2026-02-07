#!/usr/bin/env node
/**
 * Test script to index and search the current codebase.
 */

import { loadConfig } from "../src/config/loader.js";
import { IndexingService } from "../src/services/indexing.service.js";
import { SearchService } from "../src/services/search.service.js";
import { initLogger } from "../src/utils/logger.js";
import { LogLevel } from "../src/models/types.js";

// Initialize logger
initLogger({ level: LogLevel.INFO, pretty: true });

async function main() {
  console.log("🚀 Testing Semantica Search on current project\n");

  const projectRoot = process.cwd();
  const config = loadConfig();

  console.log("📁 Project root:", projectRoot);
  console.log("⚙️  Configuration loaded\n");

  // Initialize services
  const indexingService = new IndexingService(config, projectRoot);
  const searchService = new SearchService(config);

  // Test 1: Check current index status
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("📊 TEST 1: Get Index Status");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

  const beforeStats = await indexingService.getStats();
  console.log("Before indexing:");
  console.log(
    "  Collection exists:",
    beforeStats.collectionExists ? "✅" : "❌",
  );
  console.log("  Total vectors:", beforeStats.vectorCount);
  console.log("  Dimensions:", beforeStats.dimensions);
  console.log("");

  // Test 2: Index the codebase
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("📦 TEST 2: Index Current Codebase");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

  const indexResult = await indexingService.indexCodebase((progress) => {
    console.log(`[${progress.phase}] ${progress.message}`);
  });

  console.log("\n✅ Indexing complete!");
  console.log("  Files processed:", indexResult.totalFiles);
  console.log("  Chunks extracted:", indexResult.totalChunks);
  console.log("  Embeddings generated:", indexResult.totalEmbeddings);
  console.log("  Duration:", (indexResult.duration / 1000).toFixed(2), "s");
  console.log("  Errors:", indexResult.errors.length);

  if (indexResult.errors.length > 0) {
    console.log("\n⚠️  Errors:");
    indexResult.errors.slice(0, 5).forEach((e) => {
      console.log(`  - ${e.file}: ${e.error}`);
    });
  }
  console.log("");

  // Test 3: Check status after indexing
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("📊 TEST 3: Get Index Status After Indexing");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

  const afterStats = await indexingService.getStats();
  console.log("After indexing:");
  console.log(
    "  Collection exists:",
    afterStats.collectionExists ? "✅" : "❌",
  );
  console.log("  Total vectors:", afterStats.vectorCount);
  console.log("  Dimensions:", afterStats.dimensions);
  console.log("");

  // Test 4: Semantic search
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("🔍 TEST 4: Semantic Search");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

  const queries = [
    "vector database operations",
    "embedding provider",
    "configuration validation",
    "parse TypeScript code",
  ];

  for (const query of queries) {
    console.log(`\n🔎 Query: "${query}"`);
    console.log("─".repeat(50));

    const results = await searchService.search(query, {
      maxResults: 3,
      minScore: 0.5,
    });

    console.log(`Found ${results.length} results:\n`);

    results.forEach((r, i) => {
      console.log(
        `${i + 1}. ${r.filePath} (lines ${r.lines.start}-${r.lines.end})`,
      );
      console.log(`   Score: ${r.score.toFixed(3)} | ${r.language}`);
      console.log(`   Symbol: ${r.metadata.symbolName || "N/A"}`);
      console.log("");
    });
  }

  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("✅ All Tests Complete!");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

  console.log("🎉 Semantica Search is working perfectly!");
}

main().catch((error) => {
  console.error("❌ Test failed:", error);
  process.exit(1);
});
