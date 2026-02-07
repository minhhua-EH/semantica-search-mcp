/**
 * Analyze specific failing batches: 24, 28, 32
 * With batchSize=4, these are batches starting at indices 24, 28, 32
 */

import { ConfigLoader } from "../src/config/loader.js";
import { FileService } from "../src/services/file.service.js";
import { createParser } from "../src/parsers/factory.js";
import type { CodeChunk } from "../src/models/code-chunk.js";
import { countTokens } from "../src/utils/token-counter.js";

const projectPath = "/Users/huaanhminh/Projects/form-config-poc";

console.log("🔍 Analyzing Specific Failing Batches\n");

// Load config and parse files
const configLoader = new ConfigLoader();
const config = await configLoader.load(projectPath);

const fileService = new FileService(
  projectPath,
  config.indexing,
  config.performance || {
    maxFileSize: "1MB",
    maxConcurrent: 10,
    cacheEnabled: true,
    cacheTTL: 3600,
    batchDelay: 500,
  },
);

const files = await fileService.discoverFiles();
console.log(`✅ Found ${files.length} files`);

// Parse all files
const allChunks: CodeChunk[] = [];
for (const file of files) {
  if (!file.language) continue;

  const parser = createParser(file.language);
  const content = fileService.readFile(file.absolutePath);
  const result = await parser.parse(content, file.relativePath);

  for (const chunk of result.chunks) {
    chunk.metadata.absolutePath = file.absolutePath;
    chunk.metadata.filePath = file.relativePath;
  }

  allChunks.push(...result.chunks);
}

console.log(`✅ Total chunks: ${allChunks.length}\n`);

const batchSize = config.embedding.batchSize || 4;
console.log(`📦 Batch size: ${batchSize}`);

// Analyze failing batches
const failingBatchStarts = [24, 28, 32];

console.log(`\n${"=".repeat(80)}`);
console.log("🔍 Analyzing Each Failing Batch");
console.log(`${"=".repeat(80)}\n`);

for (const batchStart of failingBatchStarts) {
  const batchNum = Math.floor(batchStart / batchSize);
  const chunks = allChunks.slice(batchStart, batchStart + batchSize);

  console.log(`\n${"─".repeat(80)}`);
  console.log(`📦 BATCH ${batchNum} (Starting at index ${batchStart})`);
  console.log(`${"─".repeat(80)}`);

  if (chunks.length === 0) {
    console.log("⚠️  No chunks in this batch!");
    continue;
  }

  console.log(`\n📊 Batch Summary:`);
  console.log(`  - Chunks in batch: ${chunks.length}`);

  const tokens = chunks.map((c) => countTokens(c.content));
  const chars = chunks.map((c) => c.content.length);

  console.log(`  - Tokens: ${tokens.join(", ")}`);
  console.log(`  - Chars: ${chars.join(", ")}`);
  console.log(`  - Total tokens: ${tokens.reduce((a, b) => a + b, 0)}`);
  console.log(`  - Total chars: ${chars.reduce((a, b) => a + b, 0)}`);

  console.log(`\n📄 Chunks in this batch:`);

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const chunkIndex = batchStart + i;

    console.log(`\n  [${chunkIndex}] ${chunk.metadata.filePath}`);
    console.log(
      `      Lines ${chunk.metadata.startLine}-${chunk.metadata.endLine}`,
    );
    console.log(
      `      Type: ${chunk.metadata.chunkType}, Symbol: ${chunk.metadata.symbolName || "N/A"}`,
    );
    console.log(
      `      Size: ${countTokens(chunk.content)} tokens, ${chunk.content.length} chars`,
    );

    // Check for issues
    const issues: string[] = [];
    if (chunk.content.length > 3000) issues.push("VERY LARGE");
    if (chunk.content.length < 20) issues.push("VERY SMALL");
    if (/[^\x00-\x7F]/.test(chunk.content)) issues.push("NON-ASCII");
    if (chunk.content.includes("\0")) issues.push("NULL BYTES");
    if (chunk.content.split("\n").some((l) => l.length > 500))
      issues.push("LONG LINES");

    if (issues.length > 0) {
      console.log(`      ⚠️  Issues: ${issues.join(", ")}`);
    }

    // Show snippet
    const preview = chunk.content.substring(0, 150).replace(/\n/g, " ");
    console.log(`      Preview: ${preview}...`);
  }

  // Try to identify pattern
  console.log(`\n🔬 Batch Analysis:`);

  const avgTokens = tokens.reduce((a, b) => a + b, 0) / tokens.length;
  const avgChars = chars.reduce((a, b) => a + b, 0) / chars.length;

  console.log(`  - Average tokens per chunk: ${avgTokens.toFixed(0)}`);
  console.log(`  - Average chars per chunk: ${avgChars.toFixed(0)}`);

  // Check if all from same file
  const uniqueFiles = new Set(chunks.map((c) => c.metadata.filePath));
  if (uniqueFiles.size === 1) {
    console.log(
      `  - ⚠️  All chunks from same file: ${Array.from(uniqueFiles)[0]}`,
    );
  } else {
    console.log(`  - Files: ${uniqueFiles.size} different files`);
  }

  // Combined content length
  const combinedContent = chunks.map((c) => c.content).join("\n");
  console.log(`  - Combined content length: ${combinedContent.length} chars`);
  console.log(`  - Combined tokens: ${countTokens(combinedContent)}`);
}

// Compare with successful batches
console.log(`\n\n${"=".repeat(80)}`);
console.log("📊 Comparison with Successful Batches");
console.log(`${"=".repeat(80)}\n`);

const successfulBatchStarts = [0, 4, 8, 12, 16]; // First 5 batches
console.log(
  `Analyzing successful batches: ${successfulBatchStarts.join(", ")}\n`,
);

for (const batchStart of successfulBatchStarts) {
  const chunks = allChunks.slice(batchStart, batchStart + batchSize);
  const tokens = chunks.map((c) => countTokens(c.content));
  const chars = chunks.map((c) => c.content.length);
  const totalTokens = tokens.reduce((a, b) => a + b, 0);
  const totalChars = chars.reduce((a, b) => a + b, 0);

  console.log(
    `  Batch ${Math.floor(batchStart / batchSize)}: ${totalTokens} tokens, ${totalChars} chars`,
  );
}

// Failing batches summary
console.log(`\nFailing batches:`);
for (const batchStart of failingBatchStarts) {
  const chunks = allChunks.slice(batchStart, batchStart + batchSize);
  const tokens = chunks.map((c) => countTokens(c.content));
  const chars = chunks.map((c) => c.content.length);
  const totalTokens = tokens.reduce((a, b) => a + b, 0);
  const totalChars = chars.reduce((a, b) => a + b, 0);

  console.log(
    `  Batch ${Math.floor(batchStart / batchSize)}: ${totalTokens} tokens, ${totalChars} chars`,
  );
}

console.log(`\n✅ Analysis complete!\n`);
