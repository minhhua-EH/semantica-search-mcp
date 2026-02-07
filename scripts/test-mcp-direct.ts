#!/usr/bin/env node
/**
 * Test the MCP server directly without Claude Code.
 * This simulates what Claude Code does when calling index_codebase.
 */

import { loadConfig } from "../src/config/loader.js";
import { IndexingService } from "../src/services/indexing.service.js";
import { SearchService } from "../src/services/search.service.js";

async function testIndexing() {
  console.log("🧪 Testing MCP-style indexing for form-config-poc\n");

  const projectPath = "/Users/huaanhminh/Projects/form-config-poc";

  try {
    console.log("Step 1: Load config from project directory");
    const configPath = `${projectPath}/.semantica/config.json`;
    console.log("Config path:", configPath);

    const config = loadConfig(configPath);
    console.log("✅ Config loaded");
    console.log("  Include patterns:", config.indexing.include);
    console.log("  Batch size:", config.embedding.batchSize);
    console.log("");

    console.log("Step 2: Create services");
    const indexingService = new IndexingService(config, projectPath);
    const searchService = new SearchService(config);
    console.log("✅ Services created\n");

    console.log("Step 3: Run indexing");
    const result = await indexingService.indexCodebase((progress) => {
      console.log(
        `  [${progress.phase}] ${progress.current}/${progress.total}`,
      );
    });

    console.log("\n✅ Indexing completed!");
    console.log("Result:", JSON.stringify(result, null, 2));

    // Now test search
    console.log("\n Step 4: Test search");
    const searchResults = await searchService.search("validation logic", {
      maxResults: 3,
      minScore: 0.6,
    });

    console.log(`✅ Found ${searchResults.length} results:`);
    searchResults.forEach((r, i) => {
      console.log(
        `\n${i + 1}. ${r.filePath} (lines ${r.lines.start}-${r.lines.end})`,
      );
      console.log(`   Score: ${r.score.toFixed(3)}`);
      console.log(`   Symbol: ${r.metadata.symbolName || "N/A"}`);
      if (r.snippet) {
        console.log(`   Snippet: ${r.snippet.substring(0, 100)}...`);
      }
    });
  } catch (error) {
    console.error("\n❌ ERROR:", error);
    console.error("\nStack:", error instanceof Error ? error.stack : "N/A");
    process.exit(1);
  }
}

testIndexing();
