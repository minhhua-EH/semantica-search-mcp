/**
 * Analyze failing chunks to understand Ollama 500 errors.
 * Batches 24, 28, 32 consistently fail (chunks 96-99, 112-115, 128-131)
 */

import { ConfigLoader } from "../src/config/loader.js";
import { FileService } from "../src/services/file.service.js";
import { createParser } from "../src/parsers/factory.js";
import type { CodeChunk } from "../src/models/code-chunk.js";
import { countTokens } from "../src/utils/token-counter.js";

const projectPath = "/Users/huaanhminh/Projects/form-config-poc";

console.log("🔍 Analyzing failing chunks\n");

// Step 1: Load config and discover files
console.log("Step 1: Loading config and discovering files");
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
console.log(`✅ Found ${files.length} files\n`);

// Step 2: Parse all files and collect chunks
console.log("Step 2: Parsing files and extracting chunks");
const allChunks: CodeChunk[] = [];

for (const file of files) {
  if (!file.language) continue;

  const parser = createParser(file.language);
  const content = fileService.readFile(file.absolutePath);
  const result = await parser.parse(content, file.relativePath);

  for (const chunk of result.chunks) {
    chunk.metadata.absolutePath = file.absolutePath;
    chunk.metadata.filePath = file.relativePath;
    chunk.metadata.lastModified = file.lastModified;
  }

  allChunks.push(...result.chunks);
}

console.log(`✅ Extracted ${allChunks.length} chunks\n`);

// Step 3: Identify failing batch indices
const batchSize = 4; // From config
const failingBatches = [24, 28, 32];
const failingIndices: number[] = [];

for (const batchNum of failingBatches) {
  const startIdx = batchNum;
  for (let i = 0; i < batchSize && startIdx + i < allChunks.length; i++) {
    failingIndices.push(startIdx + i);
  }
}

console.log("Step 3: Analyzing failing chunks");
console.log(`Failing batch numbers: ${failingBatches.join(", ")}`);
console.log(`Failing chunk indices: ${failingIndices.join(", ")}\n`);

// Step 4: Analyze each failing chunk
for (const idx of failingIndices) {
  const chunk = allChunks[idx];

  console.log(`\n${"=".repeat(80)}`);
  console.log(`📦 Chunk #${idx} (Batch ${Math.floor(idx / batchSize)})`);
  console.log(`${"=".repeat(80)}`);

  console.log(`\n📄 File: ${chunk.metadata.filePath}`);
  console.log(
    `📍 Lines: ${chunk.metadata.startLine}-${chunk.metadata.endLine}`,
  );
  console.log(`🏷️  Type: ${chunk.metadata.chunkType}`);
  console.log(`🔤 Symbol: ${chunk.metadata.symbolName || "N/A"}`);

  // Analyze content
  const content = chunk.content;
  const tokens = countTokens(content);
  const charCount = content.length;
  const lineCount = content.split("\n").length;

  console.log(`\n📊 Size Analysis:`);
  console.log(`  - Characters: ${charCount}`);
  console.log(`  - Tokens (estimated): ${tokens}`);
  console.log(`  - Lines: ${lineCount}`);

  // Check for special characters
  const hasNonAscii = /[^\x00-\x7F]/.test(content);
  const hasControlChars = /[\x00-\x1F]/.test(content);
  const hasNullBytes = content.includes("\0");

  console.log(`\n🔍 Character Analysis:`);
  console.log(`  - Non-ASCII characters: ${hasNonAscii ? "YES ⚠️" : "NO"}`);
  console.log(`  - Control characters: ${hasControlChars ? "YES ⚠️" : "NO"}`);
  console.log(`  - Null bytes: ${hasNullBytes ? "YES ⚠️" : "NO"}`);

  // Check content length extremes
  const isTooLong = charCount > 5000;
  const isTooShort = charCount < 10;

  console.log(`\n⚖️  Length Check:`);
  console.log(`  - Too long (>5000 chars): ${isTooLong ? "YES ⚠️" : "NO"}`);
  console.log(`  - Too short (<10 chars): ${isTooShort ? "YES ⚠️" : "NO"}`);

  // Show first 200 characters
  console.log(`\n📝 Content Preview (first 200 chars):`);
  console.log(`${"─".repeat(80)}`);
  console.log(content.substring(0, 200) + (content.length > 200 ? "..." : ""));
  console.log(`${"─".repeat(80)}`);

  // Show last 200 characters if content is long
  if (content.length > 400) {
    console.log(`\n📝 Content Preview (last 200 chars):`);
    console.log(`${"─".repeat(80)}`);
    console.log(
      "..." + content.substring(content.length - 200, content.length),
    );
    console.log(`${"─".repeat(80)}`);
  }

  // Check for specific patterns that might cause issues
  const hasVeryLongLines = content
    .split("\n")
    .some((line) => line.length > 500);
  const hasManyConsecutiveSpaces = /\s{50,}/.test(content);
  const hasRepeatingPatterns = /(.{10,})\1{3,}/.test(content);

  console.log(`\n🔬 Pattern Analysis:`);
  console.log(
    `  - Very long lines (>500 chars): ${hasVeryLongLines ? "YES ⚠️" : "NO"}`,
  );
  console.log(
    `  - Many consecutive spaces (50+): ${hasManyConsecutiveSpaces ? "YES ⚠️" : "NO"}`,
  );
  console.log(
    `  - Repeating patterns: ${hasRepeatingPatterns ? "YES ⚠️" : "NO"}`,
  );
}

// Step 5: Compare with successful chunks
console.log(`\n\n${"=".repeat(80)}`);
console.log("📊 Comparison with Successful Chunks");
console.log(`${"=".repeat(80)}`);

const successfulIndices = [0, 4, 8, 12]; // First few batches that succeed
const successfulChunks = successfulIndices.map((i) => allChunks[i]);
const failingChunks = failingIndices.map((i) => allChunks[i]);

const avgSuccessfulTokens =
  successfulChunks.reduce((sum, c) => sum + countTokens(c.content), 0) /
  successfulChunks.length;
const avgFailingTokens =
  failingChunks.reduce((sum, c) => sum + countTokens(c.content), 0) /
  failingChunks.length;

const avgSuccessfulChars =
  successfulChunks.reduce((sum, c) => sum + c.content.length, 0) /
  successfulChunks.length;
const avgFailingChars =
  failingChunks.reduce((sum, c) => sum + c.content.length, 0) /
  failingChunks.length;

console.log(`\n📈 Average Statistics:`);
console.log(
  `  Successful chunks: ${avgSuccessfulTokens.toFixed(0)} tokens, ${avgSuccessfulChars.toFixed(0)} chars`,
);
console.log(
  `  Failing chunks: ${avgFailingTokens.toFixed(0)} tokens, ${avgFailingChars.toFixed(0)} chars`,
);
console.log(
  `  Difference: ${(avgFailingTokens - avgSuccessfulTokens).toFixed(0)} tokens, ${(avgFailingChars - avgSuccessfulChars).toFixed(0)} chars`,
);

// Step 6: Summary
console.log(`\n\n${"=".repeat(80)}`);
console.log("📋 Summary & Recommendations");
console.log(`${"=".repeat(80)}`);

const maxFailingTokens = Math.max(
  ...failingChunks.map((c) => countTokens(c.content)),
);
const maxFailingChars = Math.max(...failingChunks.map((c) => c.content.length));

console.log(`\n🔢 Failing Chunks Statistics:`);
console.log(`  - Total failing chunks: ${failingChunks.length}`);
console.log(`  - Max tokens: ${maxFailingTokens}`);
console.log(`  - Max characters: ${maxFailingChars}`);
console.log(
  `  - Avg tokens: ${avgFailingTokens.toFixed(0)} (vs ${avgSuccessfulTokens.toFixed(0)} successful)`,
);

console.log(`\n💡 Possible Causes:`);
if (avgFailingTokens > avgSuccessfulTokens * 1.5) {
  console.log(
    `  ⚠️  Failing chunks are significantly larger (${((avgFailingTokens / avgSuccessfulTokens - 1) * 100).toFixed(0)}% bigger)`,
  );
  console.log(`  → Consider reducing maxChunkSize in config`);
}

const hasSpecialCharsInFailing = failingChunks.some((c) =>
  /[^\x00-\x7F]/.test(c.content),
);
if (hasSpecialCharsInFailing) {
  console.log(`  ⚠️  Some failing chunks contain non-ASCII characters`);
  console.log(`  → Possible encoding issue with Ollama`);
}

const hasLongLinesInFailing = failingChunks.some((c) =>
  c.content.split("\n").some((line) => line.length > 500),
);
if (hasLongLinesInFailing) {
  console.log(`  ⚠️  Some failing chunks have very long lines`);
  console.log(`  → May exceed Ollama's line length limits`);
}

console.log(`\n✅ Analysis complete!\n`);
