/**
 * Test AST split-merge on large codebases (vevo-service and ats).
 */

import { ConfigLoader } from "../src/config/loader.js";
import { IndexingService } from "../src/services/indexing.service.js";

console.log("🧪 Testing AST Split-Merge on Large Codebases\n");
console.log("=".repeat(80));

const projects = [
  {
    name: "vevo-service",
    path: "/Users/huaanhminh/Projects/vevo-service",
  },
  {
    name: "ats",
    path: "/Users/huaanhminh/Projects/ats",
  },
];

for (const project of projects) {
  console.log(`\n\n${"=".repeat(80)}`);
  console.log(`📦 Testing: ${project.name}`);
  console.log(`${"=".repeat(80)}\n`);

  try {
    const startTime = Date.now();

    // Load config
    console.log("Loading configuration...");
    const configLoader = new ConfigLoader();
    const config = await configLoader.load(project.path);
    console.log(
      `✅ Config loaded (batchSize: ${config.embedding.batchSize})\n`,
    );

    // Create indexing service
    const indexingService = new IndexingService(config, project.path);

    // Run indexing with progress
    console.log("Starting indexing...");
    let lastPhase = "";

    const result = await indexingService.indexCodebase((progress) => {
      if (progress.phase !== lastPhase) {
        console.log(`\n[${progress.phase.toUpperCase()}]`);
        lastPhase = progress.phase;
      }

      if (progress.phase === "parsing" && progress.current % 50 === 0) {
        process.stdout.write(
          `\r  Files: ${progress.current}/${progress.total}`,
        );
      }

      if (progress.phase === "embedding" && progress.current % 100 === 0) {
        process.stdout.write(
          `\r  Embeddings: ${progress.current}/${progress.total}`,
        );
      }
    });

    const duration = Date.now() - startTime;

    console.log(`\n\n${"─".repeat(80)}`);
    console.log("✅ INDEXING COMPLETE!");
    console.log(`${"─".repeat(80)}\n`);

    console.log(`📊 Statistics:`);
    console.log(`   Files indexed: ${result.totalFiles}`);
    console.log(`   Chunks created: ${result.totalChunks}`);
    console.log(`   Embeddings generated: ${result.totalEmbeddings}`);
    console.log(
      `   Success rate: ${((result.totalEmbeddings / result.totalChunks) * 100).toFixed(1)}%`,
    );
    console.log(`   Duration: ${(duration / 1000).toFixed(1)}s`);
    console.log(
      `   Speed: ${(result.totalFiles / (duration / 1000)).toFixed(1)} files/sec`,
    );

    if (result.errors.length > 0) {
      console.log(`\n⚠️  Errors: ${result.errors.length}`);
      console.log(`   Failed batches:`);
      for (const error of result.errors.slice(0, 5)) {
        console.log(`   - ${error.file}: ${error.error}`);
      }
      if (result.errors.length > 5) {
        console.log(`   ... and ${result.errors.length - 5} more`);
      }
    } else {
      console.log(`\n🎉 PERFECT: Zero errors!`);
    }

    // Calculate metrics
    const avgChunkSize =
      result.totalChunks > 0
        ? Math.round((result.totalFiles / result.totalChunks) * 100) / 100
        : 0;

    console.log(`\n📈 Analysis:`);
    console.log(`   Avg chunks per file: ${avgChunkSize.toFixed(1)}`);
    console.log(`   Total embeddings: ${result.totalEmbeddings}`);
    console.log(
      `   Chunk reduction: ${result.totalChunks} optimized chunks (AST split-merge)`,
    );

    if (result.totalEmbeddings === result.totalChunks) {
      console.log(`\n✅ 100% SUCCESS RATE - All chunks embedded successfully!`);
    }
  } catch (error) {
    console.log(`\n❌ FAILED!`);
    console.log(
      `   Error: ${error instanceof Error ? error.message : String(error)}`,
    );
    if (error instanceof Error && error.stack) {
      console.log(
        `   Stack: ${error.stack.split("\n").slice(0, 5).join("\n")}`,
      );
    }
  }
}

console.log(`\n\n${"=".repeat(80)}`);
console.log("✅ TESTING COMPLETE!");
console.log(`${"=".repeat(80)}\n`);
