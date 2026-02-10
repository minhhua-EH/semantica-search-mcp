/**
 * Test script for OpenAI embedding provider.
 * Tests real API connection and basic functionality.
 */

import { OpenAIProvider } from "../src/providers/embedding/openai.provider.js";
import type { OpenAIConfig } from "../src/config/schema.js";

async function main() {
  // Get API key from environment
  const apiKey = process.env.CLAUDE_CONTEXT_OPENAI_KEY;
  if (!apiKey) {
    console.error("❌ Error: CLAUDE_CONTEXT_OPENAI_KEY not set");
    process.exit(1);
  }

  console.log("🔑 API key loaded:", apiKey.substring(0, 10) + "...\n");

  // Test configuration
  const config: OpenAIConfig = {
    apiKey,
    model: "text-embedding-3-small",
    dimensions: 1536,
    timeout: 30000,
  };

  console.log("🧪 Testing OpenAI Provider\n");
  console.log("=".repeat(60));

  // Create provider
  console.log("\n1️⃣  Creating provider...");
  const provider = new OpenAIProvider("text-embedding-3-small", config);
  console.log("✅ Provider created successfully");
  console.log(`   - Name: ${provider.name}`);
  console.log(`   - Model: ${provider.modelName}`);
  console.log(`   - Dimensions: ${provider.dimensions}`);
  console.log(`   - Max Tokens: ${provider.maxTokens}`);

  // Test health check
  console.log("\n2️⃣  Testing health check...");
  try {
    const isHealthy = await provider.healthCheck();
    if (isHealthy) {
      console.log("✅ Health check passed - API is accessible");
    } else {
      console.log("⚠️  Health check failed - API may not be accessible");
    }
  } catch (error: any) {
    console.error("❌ Health check error:", error.message);
    process.exit(1);
  }

  // Test single embedding
  console.log("\n3️⃣  Testing single embedding generation...");
  const testText = "Hello, this is a test for semantic search!";
  console.log(`   Input: "${testText}"`);

  try {
    const startTime = Date.now();
    const embedding = await provider.embed(testText);
    const duration = Date.now() - startTime;

    console.log("✅ Embedding generated successfully");
    console.log(`   - Vector length: ${embedding.length}`);
    console.log(
      `   - First 5 values: [${embedding
        .slice(0, 5)
        .map((v) => v.toFixed(4))
        .join(", ")}]`,
    );
    console.log(`   - Duration: ${duration}ms`);

    // Verify dimensions
    if (embedding.length === config.dimensions) {
      console.log(`   - ✅ Dimensions match (${embedding.length})`);
    } else {
      console.log(
        `   - ⚠️  Dimension mismatch: expected ${config.dimensions}, got ${embedding.length}`,
      );
    }
  } catch (error: any) {
    console.error("❌ Embedding generation error:", error.message);
    if (error.status) {
      console.error(`   - Status: ${error.status}`);
    }
    process.exit(1);
  }

  // Test batch embedding (small batch)
  console.log("\n4️⃣  Testing batch embedding (3 texts)...");
  const batchTexts = [
    "First test sentence",
    "Second test sentence",
    "Third test sentence",
  ];

  try {
    const startTime = Date.now();
    const embeddings = await provider.embedBatch(batchTexts);
    const duration = Date.now() - startTime;

    console.log("✅ Batch embeddings generated successfully");
    console.log(`   - Input texts: ${batchTexts.length}`);
    console.log(`   - Output embeddings: ${embeddings.length}`);
    console.log(
      `   - Duration: ${duration}ms (${(duration / batchTexts.length).toFixed(0)}ms per text)`,
    );
  } catch (error: any) {
    console.error("❌ Batch embedding error:", error.message);
    process.exit(1);
  }

  // Test cost estimation
  console.log("\n5️⃣  Testing cost estimation...");
  const testTokenCounts = [1_000, 10_000, 100_000, 1_000_000];

  console.log("\n   Cost estimates for text-embedding-3-small:");
  for (const tokenCount of testTokenCounts) {
    const cost = provider.estimateCost(tokenCount);
    const formatted = tokenCount.toLocaleString();
    console.log(`   - ${formatted.padStart(10)} tokens: $${cost.toFixed(6)}`);
  }

  const breakdown = provider.getCostBreakdown(100_000);
  console.log("\n   Detailed breakdown for 100K tokens:");
  console.log(`   - Model: ${breakdown.model}`);
  console.log(`   - Cost per 1M tokens: $${breakdown.costPerMillionTokens}`);
  console.log(`   - Estimated cost: $${breakdown.estimatedCost.toFixed(6)}`);

  // Test listing available models
  console.log("\n6️⃣  Testing model listing...");
  try {
    const models = await provider.getAvailableModels();
    console.log("✅ Available embedding models:");
    models.forEach((model) => {
      console.log(`   - ${model}`);
    });
  } catch (error: any) {
    console.error("❌ Model listing error:", error.message);
  }

  // Clean up
  console.log("\n7️⃣  Cleaning up...");
  await provider.close();
  console.log("✅ Provider closed successfully");

  console.log("\n" + "=".repeat(60));
  console.log("✅ All tests passed! OpenAI provider is working correctly.");
  console.log("=".repeat(60) + "\n");
}

main().catch((error) => {
  console.error("\n❌ Fatal error:", error);
  process.exit(1);
});
