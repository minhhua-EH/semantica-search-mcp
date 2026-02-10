/**
 * Quick test for OpenAI indexing integration.
 */

import { ConfigLoader } from "../src/config/loader.js";
import { createEmbeddingProvider } from "../src/providers/embedding/factory.js";
import { createVectorDBProvider } from "../src/providers/vectordb/factory.js";
import { IndexingService } from "../src/services/indexing.service.js";

async function main() {
  console.log("🧪 Testing OpenAI Integration\n");

  const projectPath = process.cwd();

  // Load config
  console.log("1️⃣  Loading configuration...");
  const configLoader = new ConfigLoader(projectPath);
  const config = await configLoader.load();
  console.log(`✅ Provider: ${config.embedding.provider}, Model: ${config.embedding.model}\n`);

  // Create providers
  console.log("2️⃣  Creating OpenAI provider...");
  const embeddingProvider = createEmbeddingProvider(config.embedding);
  console.log(`✅ ${embeddingProvider.name} - ${embeddingProvider.modelName}\n`);

  console.log("3️⃣  Testing API connection...");
  const isHealthy = await embeddingProvider.healthCheck();
  if (!isHealthy) {
    console.error("❌ API connection failed");
    process.exit(1);
  }
  console.log("✅ API connected\n");

  console.log("4️⃣  Creating vector DB provider...");
  const vectorDBProvider = createVectorDBProvider(config.vectordb);
  await vectorDBProvider.connect();
  console.log(`✅ Connected to ${vectorDBProvider.name}\n`);

  // Index
  console.log("5️⃣  Indexing codebase with OpenAI...\n");
  const indexingService = new IndexingService(
    projectPath,
    config,
    embeddingProvider,
    vectorDBProvider,
  );

  const startTime = Date.now();
  const result = await indexingService.indexCodebase();
  const duration = (Date.now() - startTime) / 1000;

  console.log("\n✅ Indexing complete!");
  console.log(`   Files: ${result.filesProcessed}`);
  console.log(`   Chunks: ${result.chunksCreated}`);
  console.log(`   Duration: ${duration.toFixed(1)}s`);
  console.log(`   Cost: ~$${((result.chunksCreated * 175 / 1_000_000) * 0.02).toFixed(6)}\n`);

  // Verify
  const stats = await vectorDBProvider.getStats(config.vectordb.collectionName);
  console.log(`📊 Vectors in DB: ${stats.vectorCount}`);
  console.log(`   Dimensions: ${stats.dimensions}\n`);

  await embeddingProvider.close();
  await vectorDBProvider.close();

  console.log("✅ Test passed! OpenAI integration working! 🎉\n");
}

main().catch((error) => {
  console.error("\n❌ Error:", error.message);
  process.exit(1);
});
