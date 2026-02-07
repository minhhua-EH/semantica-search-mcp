/**
 * Comprehensive verification test for AST split-merge chunking.
 * Tests multiple codebases multiple times to verify consistency.
 */

import { ConfigLoader } from "../src/config/loader.js";
import { IndexingService } from "../src/services/indexing.service.js";

console.log("🧪 Comprehensive AST Split-Merge Verification\n");
console.log("=".repeat(80));

const projects = [
  {
    name: "form-config-poc (Ruby)",
    path: "/Users/huaanhminh/Projects/form-config-poc",
    expectedFiles: 67,
    expectedChunksRange: [170, 190], // Expect ~179 chunks
  },
  {
    name: "semantica-search-mcp (TypeScript)",
    path: "/Users/huaanhminh/Projects/semantica-search-mcp",
    expectedFiles: 26,
    expectedChunksRange: [180, 240], // Expect ~220 chunks
  },
];

const iterations = 3; // Test each project 3 times
const results: any[] = [];

for (const project of projects) {
  console.log(`\n\n${"=".repeat(80)}`);
  console.log(`📦 Testing: ${project.name}`);
  console.log(`${"=".repeat(80)}\n`);

  for (let i = 1; i <= iterations; i++) {
    console.log(`\n🔄 Iteration ${i}/${iterations}`);
    console.log(`${"─".repeat(80)}`);

    try {
      const startTime = Date.now();

      // Load config
      const configLoader = new ConfigLoader();
      const config = await configLoader.load(project.path);

      // Create indexing service
      const indexingService = new IndexingService(config, project.path);

      // Run indexing
      const result = await indexingService.indexCodebase((progress) => {
        if (progress.phase === "embedding" && progress.current % 20 === 0) {
          process.stdout.write(
            `\r  [${progress.phase}] ${progress.current}/${progress.total}`,
          );
        }
      });

      const duration = Date.now() - startTime;

      console.log(`\n`);
      console.log(`✅ Iteration ${i} complete!`);
      console.log(`   Files: ${result.totalFiles}`);
      console.log(`   Chunks: ${result.totalChunks}`);
      console.log(
        `   Embeddings: ${result.totalEmbeddings}/${result.totalChunks}`,
      );
      console.log(
        `   Success rate: ${((result.totalEmbeddings / result.totalChunks) * 100).toFixed(1)}%`,
      );
      console.log(`   Errors: ${result.errors.length}`);
      console.log(`   Duration: ${(duration / 1000).toFixed(1)}s`);

      // Store result
      results.push({
        project: project.name,
        iteration: i,
        files: result.totalFiles,
        chunks: result.totalChunks,
        embeddings: result.totalEmbeddings,
        successRate: (result.totalEmbeddings / result.totalChunks) * 100,
        errors: result.errors.length,
        duration,
        errorDetails: result.errors,
      });

      // Verify expectations
      if (result.totalFiles !== project.expectedFiles) {
        console.log(
          `   ⚠️  Warning: Expected ${project.expectedFiles} files, got ${result.totalFiles}`,
        );
      }

      if (
        result.totalChunks < project.expectedChunksRange[0] ||
        result.totalChunks > project.expectedChunksRange[1]
      ) {
        console.log(
          `   ⚠️  Warning: Chunk count ${result.totalChunks} outside expected range ${project.expectedChunksRange}`,
        );
      }

      // Check for perfect success
      if (result.totalEmbeddings === result.totalChunks) {
        console.log(`   🎉 PERFECT: 100% success rate!`);
      } else {
        console.log(
          `   ⚠️  ${result.totalChunks - result.totalEmbeddings} chunks failed`,
        );
      }
    } catch (error) {
      console.log(`\n❌ Iteration ${i} failed!`);
      console.log(
        `   Error: ${error instanceof Error ? error.message : String(error)}`,
      );

      results.push({
        project: project.name,
        iteration: i,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    // Wait between iterations
    if (i < iterations) {
      console.log(`\n⏳ Waiting 3 seconds before next iteration...`);
      await new Promise((resolve) => setTimeout(resolve, 3000));
    }
  }
}

// Summary
console.log(`\n\n${"=".repeat(80)}`);
console.log("📊 COMPREHENSIVE TEST SUMMARY");
console.log(`${"=".repeat(80)}\n`);

for (const project of projects) {
  const projectResults = results.filter((r) => r.project === project.name);

  console.log(`\n📦 ${project.name}`);
  console.log(`${"─".repeat(80)}`);

  const successRates = projectResults
    .filter((r) => !r.error)
    .map((r) => r.successRate);
  const avgSuccessRate =
    successRates.reduce((a, b) => a + b, 0) / successRates.length;

  const chunkCounts = projectResults
    .filter((r) => !r.error)
    .map((r) => r.chunks);
  const avgChunks = chunkCounts.reduce((a, b) => a + b, 0) / chunkCounts.length;

  const durations = projectResults
    .filter((r) => !r.error)
    .map((r) => r.duration);
  const avgDuration = durations.reduce((a, b) => a + b, 0) / durations.length;

  const totalErrors = projectResults
    .filter((r) => !r.error)
    .reduce((sum, r) => sum + r.errors, 0);

  console.log(`   Iterations: ${projectResults.length}`);
  console.log(`   Avg success rate: ${avgSuccessRate.toFixed(1)}%`);
  console.log(`   Avg chunks: ${avgChunks.toFixed(0)}`);
  console.log(`   Avg duration: ${(avgDuration / 1000).toFixed(1)}s`);
  console.log(`   Total errors: ${totalErrors}`);

  if (avgSuccessRate === 100) {
    console.log(`   🎉 PERFECT: 100% success across all iterations!`);
  }

  // Show individual results
  console.log(`\n   Individual results:`);
  for (const result of projectResults) {
    if (result.error) {
      console.log(`   - Iteration ${result.iteration}: ❌ FAILED`);
    } else {
      console.log(
        `   - Iteration ${result.iteration}: ${result.embeddings}/${result.chunks} (${result.successRate.toFixed(1)}%) - ${(result.duration / 1000).toFixed(1)}s`,
      );
    }
  }
}

// Final verdict
console.log(`\n\n${"=".repeat(80)}`);
console.log("🎯 FINAL VERDICT");
console.log(`${"=".repeat(80)}\n`);

const allResults = results.filter((r) => !r.error);
const overallSuccessRate =
  allResults.reduce((sum, r) => sum + r.successRate, 0) / allResults.length;
const perfectRuns = allResults.filter((r) => r.successRate === 100).length;
const totalRuns = allResults.length;

console.log(`Total test runs: ${totalRuns}`);
console.log(`Perfect runs (100%): ${perfectRuns}/${totalRuns}`);
console.log(`Overall average success: ${overallSuccessRate.toFixed(1)}%`);
console.log(
  `Total errors across all tests: ${allResults.reduce((sum, r) => sum + r.errors, 0)}`,
);

if (overallSuccessRate >= 99) {
  console.log(`\n✅ SUCCESS: AST split-merge achieves >99% success rate!`);
  console.log(`   Phase 2 Goal: ACHIEVED! 🎉\n`);
} else if (overallSuccessRate >= 95) {
  console.log(`\n✅ GOOD: AST split-merge significantly improves success rate`);
  console.log(`   Further optimization may be needed for 99%+ target\n`);
} else {
  console.log(`\n⚠️  WARNING: Success rate still below target`);
  console.log(`   Additional investigation needed\n`);
}
