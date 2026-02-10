/**
 * Completion notification formatter for better UX.
 */

import type { IndexingResult } from "../services/indexing.service.js";

export interface CompletionNotification {
  title: string;
  summary: string;
  suggestions: string[];
  nextSteps: string[];
}

/**
 * Format a beautiful completion notification.
 */
export function formatIndexingCompletion(
  result: IndexingResult,
  projectName: string,
  duration: number,
  cost?: string,
): string {
  const successRate =
    result.totalChunks > 0
      ? ((result.totalEmbeddings / result.totalChunks) * 100).toFixed(1)
      : "0";

  const statusEmoji = result.success ? "🎉" : "⚠️";
  const minutes = Math.floor(duration / 60);
  const seconds = Math.floor(duration % 60);
  const durationStr = minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;

  let message = "";

  // Header
  message += `${statusEmoji} INDEXING COMPLETE - ${projectName}\n`;
  message += "═".repeat(60) + "\n\n";

  // Results
  message += "📊 Results:\n";
  message += `   • Files indexed: ${result.totalFiles.toLocaleString()}\n`;
  message += `   • Chunks created: ${result.totalChunks.toLocaleString()}\n`;
  message += `   • Embeddings generated: ${result.totalEmbeddings.toLocaleString()}/${result.totalChunks.toLocaleString()}\n`;
  message += `   • Success rate: ${successRate}%\n`;
  message += `   • Duration: ${durationStr}\n`;

  if (cost) {
    message += `   • Cost: ${cost}\n`;
  }

  message += "\n";

  // Success message or errors
  if (result.success) {
    message += `✅ ${projectName} is fully searchable!\n\n`;
  } else if (parseFloat(successRate) >= 95) {
    message += `✅ ${projectName} is searchable! (${result.errors.length} minor errors)\n\n`;
  } else {
    message += `⚠️  ${projectName} is partially searchable (${result.errors.length} errors)\n\n`;
  }

  // Suggestions to try
  message += "💡 Try searching now:\n";

  const suggestions = generateSearchSuggestions(projectName, result);
  suggestions.forEach((suggestion) => {
    message += `   "${suggestion}"\n`;
  });
  message += "\n";

  // Next steps
  message += "📈 What's next:\n";
  message += "   • Incremental re-indexing is automatic (via git hooks)\n";
  message += "   • Changed files will re-index in <10 seconds\n";
  message += "   • Use 'get_index_status' to see collection stats\n";
  message += "\n";

  // Performance tip
  if (duration > 600) {
    // > 10 minutes
    message +=
      "💡 Tip: This was a full index (one-time). Daily updates are <10s!\n\n";
  }

  message += "═".repeat(60);

  return message;
}

/**
 * Generate contextual search suggestions based on project.
 */
function generateSearchSuggestions(
  projectName: string,
  result: IndexingResult,
): string[] {
  const suggestions = [
    `Search for authentication logic in ${projectName}`,
    `Find error handling patterns in ${projectName}`,
    `Search for database queries in ${projectName}`,
  ];

  // Add more based on chunk count (larger = more specific suggestions)
  if (result.totalChunks > 10000) {
    suggestions.push(`Find service layer patterns in ${projectName}`);
    suggestions.push(
      `Search for background job implementations in ${projectName}`,
    );
  }

  return suggestions.slice(0, 3); // Return top 3
}

/**
 * Format pre-flight estimate for display.
 */
export function formatPreflightEstimate(
  estimate: any,
  projectName: string,
  provider: string,
): string {
  let message = "";

  message += `📊 Pre-flight check for ${projectName}\n`;
  message += "─".repeat(60) + "\n\n";

  // File count
  if (estimate.filesCount === 0) {
    message += "⚠️  No files found to index!\n";
    message +=
      "   Check your include/exclude patterns in .semantica/config.json\n\n";
    return message;
  }

  message += `📁 Scope:\n`;
  message += `   • Files to index: ${estimate.filesCount.toLocaleString()}\n`;
  message += `   • Estimated chunks: ${estimate.estimatedChunks.toLocaleString()}\n`;
  message += `   • Provider: ${provider}\n\n`;

  // Time estimate
  message += `⏱️  Estimated time: ${estimate.estimatedTime}\n`;
  message += `   (This is a one-time operation)\n\n`;

  // Cost estimate
  message += `💰 Estimated cost: ${estimate.estimatedCost}\n\n`;

  // Health checks
  message += `🔍 System checks:\n`;
  message += `   ${estimate.checks.configExists ? "✅" : "❌"} Configuration file\n`;
  message += `   ${estimate.checks.vectorDBHealthy ? "✅" : "❌"} Vector database connection\n`;
  message += `   ${estimate.checks.embeddingProviderHealthy ? "✅" : "❌"} Embedding provider\n`;
  message += `   ${estimate.checks.diskSpaceAvailable ? "✅" : "❌"} Disk space\n\n`;

  // Warnings
  if (estimate.warnings.length > 0) {
    message += "⚠️  Warnings:\n";
    estimate.warnings.forEach((warning: string) => {
      message += `   • ${warning}\n`;
    });
    message += "\n";
  }

  // Ready message
  if (
    estimate.checks.vectorDBHealthy &&
    estimate.checks.embeddingProviderHealthy
  ) {
    message += "✅ Ready to index!\n";
    message +=
      "   Indexing will run in background - you can continue working.\n";
  } else {
    message += "❌ Cannot start indexing - fix issues above first.\n";
  }

  message += "\n" + "─".repeat(60);

  return message;
}
