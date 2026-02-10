#!/usr/bin/env node

/**
 * Semantica Search MCP Server
 * Provides semantic code search capabilities via Model Context Protocol.
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

import { appendFileSync } from "fs";
import { join } from "path";
import { loadConfig } from "./config/loader.js";
import { IndexingService } from "./services/indexing.service.js";
import { SearchService } from "./services/search.service.js";
import { IncrementalIndexingService } from "./services/incremental.service.js";
import { GitHookService } from "./services/git-hook.service.js";
import { OnboardingService } from "./services/onboarding.service.js";
import { ResetStateService } from "./services/reset.service.js";
import { TOOLS } from "./mcp/tools.js";
import { initLogger, getLogger } from "./utils/logger.js";
import { LogLevel } from "./models/types.js";
import { backgroundJobs } from "./utils/background-job.js";
import { logProgress } from "./utils/progress.js";
import { estimateIndexing } from "./utils/preflight.js";
import {
  formatIndexingCompletion,
  formatPreflightEstimate,
} from "./utils/completion-notification.js";

// Debug log helper that writes to file (bypasses stdio)
function debugLog(message: string, data?: any) {
  const timestamp = new Date().toISOString();
  const logLine = `[${timestamp}] ${message}${data ? " " + JSON.stringify(data) : ""}\n`;
  try {
    appendFileSync("/tmp/semantica-debug.log", logLine);
  } catch (e) {
    // Ignore write errors
  }
}

// IMPORTANT: Disable console logging for MCP server (uses stdio)
// Logging to stdout/stderr breaks the JSON-RPC protocol
// Logger is a no-op when not initialized
const logger = getLogger();

/**
 * Create MCP server.
 */
const server = new Server(
  {
    name: "semantica-search-mcp",
    version: "0.1.0",
  },
  {
    capabilities: {
      tools: {},
    },
  },
);

/**
 * Global services (lazy-initialized).
 */
let indexingService: IndexingService | null = null;
let searchService: SearchService | null = null;
let config: any = null;

/**
 * Check for git hook trigger and auto re-index if needed.
 */
async function checkGitTrigger(projectPath: string): Promise<boolean> {
  const triggerPath = `${projectPath}/.semantica/reindex-trigger.json`;

  try {
    const fs = await import("fs");
    if (!fs.existsSync(triggerPath)) {
      return false;
    }

    // Read trigger file
    const trigger = JSON.parse(fs.readFileSync(triggerPath, "utf-8"));

    // Check if recent (within last 5 minutes)
    const age = Date.now() - trigger.timestamp;
    if (age > 300000) {
      // Too old, delete it
      fs.unlinkSync(triggerPath);
      return false;
    }

    console.error(
      `[GIT HOOK] Detected ${trigger.trigger} trigger (${trigger.changedFiles} files changed)`,
    );
    console.error(`[GIT HOOK] Auto-triggering incremental re-index...`);

    // DELETE trigger file immediately to prevent re-triggering
    fs.unlinkSync(triggerPath);

    // Load config and trigger incremental re-index
    const projectConfig = loadConfig(`${projectPath}/.semantica/config.json`);
    const incrementalService = new IncrementalIndexingService(
      projectConfig,
      projectPath,
    );

    // Run in background
    incrementalService
      .reindexChangedFiles()
      .then((result) => {
        console.error(
          `[GIT HOOK] ✅ Auto re-index complete! ${result.filesProcessed} files in ${(result.duration / 1000).toFixed(1)}s`,
        );
      })
      .catch((error) => {
        console.error(`[GIT HOOK] ❌ Auto re-index failed:`, error);
      });

    return true;
  } catch (error) {
    console.error(`[GIT HOOK] Error checking trigger:`, error);
    return false;
  }
}

/**
 * Initialize services.
 */
function initServices(projectRoot: string) {
  try {
    console.error("[INIT] Starting service initialization...");
    console.error("[INIT] Project root:", projectRoot);

    if (!config) {
      console.error("[INIT] Loading config...");
      config = loadConfig();
      console.error("[INIT] Config loaded successfully");
    }

    if (!indexingService) {
      console.error("[INIT] Creating IndexingService...");
      indexingService = new IndexingService(config, projectRoot);
      console.error("[INIT] IndexingService created");
    }

    if (!searchService) {
      console.error("[INIT] Creating SearchService...");
      searchService = new SearchService(config);
      console.error("[INIT] SearchService created");
    }

    console.error("[INIT] All services initialized successfully");
  } catch (error) {
    console.error("[INIT ERROR]", error);
    throw error;
  }
}

/**
 * Handler for listing available tools.
 */
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return { tools: TOOLS };
});

/**
 * Handler for tool execution.
 */
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case "index_codebase": {
        const path = String(args?.path || process.cwd());
        const background = args?.background !== false; // Default: true (run in background)

        debugLog("=== INDEX_CODEBASE STARTED ===");
        debugLog("Path:", path);
        debugLog("Background mode:", background);

        try {
          // Load config from project directory
          const configPath = `${path}/.semantica/config.json`;
          debugLog("Loading config from:", configPath);

          const projectConfig = loadConfig(configPath);
          debugLog("Config loaded successfully", {
            include: projectConfig.indexing.include,
            batchSize: projectConfig.embedding.batchSize,
          });

          // PRE-FLIGHT ESTIMATE
          debugLog("Running pre-flight estimate...");
          const estimate = await estimateIndexing(path, projectConfig);
          const projectName =
            projectConfig.project?.name || path.split("/").pop() || "project";

          // Show pre-flight estimate
          const preflightMessage = formatPreflightEstimate(
            estimate,
            projectName,
            projectConfig.embedding.provider,
          );

          debugLog("Pre-flight estimate:", estimate);

          // Check if can proceed
          if (
            !estimate.checks.vectorDBHealthy ||
            !estimate.checks.embeddingProviderHealthy
          ) {
            return {
              content: [
                {
                  type: "text",
                  text: preflightMessage,
                },
              ],
            };
          }

          // Initialize services
          debugLog("Creating services...");
          indexingService = new IndexingService(projectConfig, path);
          searchService = new SearchService(projectConfig);
          debugLog("Services created successfully");

          if (background) {
            // Background mode: Start job and return immediately
            const jobId = `index_${Date.now()}`;
            backgroundJobs.startJob(jobId, "indexing");

            // Start indexing in background (don't await)
            const startTime = Date.now();
            indexingService!
              .indexCodebase((progress) => {
                backgroundJobs.updateProgress(
                  jobId,
                  progress.phase,
                  progress.current,
                  progress.total,
                );
              })
              .then((result) => {
                const duration = (Date.now() - startTime) / 1000;
                backgroundJobs.completeJob(jobId, result);

                // Log beautiful completion notification to stderr (visible in logs)
                const completionMsg = formatIndexingCompletion(
                  result,
                  projectName,
                  duration,
                  estimate.estimatedCost,
                );
                console.error("\n" + completionMsg + "\n");

                debugLog("Background indexing completed!", result);
              })
              .catch((error) => {
                backgroundJobs.failJob(
                  jobId,
                  error instanceof Error ? error.message : String(error),
                );
                debugLog("Background indexing failed!", error);
              });

            return {
              content: [
                {
                  type: "text",
                  text:
                    preflightMessage +
                    "\n\n" +
                    `🚀 Indexing started in background!\n\n` +
                    `Job ID: ${jobId}\n` +
                    `Estimated time: ${estimate.estimatedTime}\n` +
                    `Estimated cost: ${estimate.estimatedCost}\n\n` +
                    `💡 You can continue using Claude Code normally.\n` +
                    `   Check progress: "Get index status"\n` +
                    `   I'll show a summary when indexing completes!\n\n` +
                    `📝 This is a one-time operation. Future updates via git hooks are <10s.`,
                },
              ],
            };
          } else {
            // Foreground mode: Wait for completion (legacy behavior)
            debugLog("Starting indexCodebase()...");

            // Show pre-flight first
            console.error("\n" + preflightMessage + "\n");
            console.error("⏱️  Starting indexing (foreground mode)...\n");

            const startTime = Date.now();
            const result = await indexingService!.indexCodebase((progress) => {
              debugLog(`Progress: ${progress.phase}`, {
                current: progress.current,
                total: progress.total,
              });
            });

            const duration = (Date.now() - startTime) / 1000;

            debugLog("IndexCodebase completed!", {
              success: result.success,
              files: result.totalFiles,
              chunks: result.totalChunks,
              embeddings: result.totalEmbeddings,
              errors: result.errors.length,
            });

            // Use beautiful completion notification
            const completionMessage = formatIndexingCompletion(
              result,
              projectName,
              duration,
              estimate.estimatedCost,
            );

            return {
              content: [
                {
                  type: "text",
                  text: completionMessage,
                },
              ],
            };
          }
        } catch (indexError) {
          debugLog("ERROR during index_codebase handler:", indexError);
          throw indexError;
        }
      }

      case "search_code": {
        const query = String(args?.query);
        const path = String(args?.path || process.cwd());
        const maxResults = args?.maxResults as number | undefined;
        const minScore = args?.minScore as number | undefined;
        const language = args?.language as string | undefined;
        const pathPattern = args?.pathPattern as string | undefined;

        // Check for git trigger and auto re-index
        await checkGitTrigger(path);

        if (!searchService) {
          initServices(path);
        }

        logger.info(`Searching for: "${query}"`);

        // Perform search
        const results = await searchService!.search(query, {
          maxResults,
          minScore,
          language,
          pathPattern,
        });

        if (results.length === 0) {
          return {
            content: [
              {
                type: "text",
                text:
                  `No results found for query: "${query}"\n\n` +
                  `Try:\n` +
                  `- Broadening your search terms\n` +
                  `- Lowering the minScore threshold\n` +
                  `- Checking if the codebase is indexed`,
              },
            ],
          };
        }

        // Format results for display
        const formattedText =
          `Found ${results.length} results for "${query}":\n\n` +
          results
            .map(
              (r, i) =>
                `${i + 1}. **${r.filePath}** (lines ${r.lines.start}-${r.lines.end})\n` +
                `   Score: ${r.score.toFixed(3)} | Language: ${r.language}\n` +
                `   \`\`\`${r.language}\n${r.snippet}\n   \`\`\``,
            )
            .join("\n\n");

        return {
          content: [
            {
              type: "text",
              text: formattedText,
            },
          ],
        };
      }

      case "get_index_status": {
        const path = String(args?.path || process.cwd());

        // Check for git trigger and auto re-index
        const triggered = await checkGitTrigger(path);

        if (triggered) {
          return {
            content: [
              {
                type: "text",
                text:
                  `🔄 Auto Re-Index Triggered!\n\n` +
                  `Git hook detected branch/commit change.\n` +
                  `Incremental re-indexing started in background.\n\n` +
                  `💡 Check status again in a few moments to see progress.`,
              },
            ],
          };
        }

        // Check if indexing is currently running
        const runningJob = backgroundJobs.getCurrentIndexingJob();

        if (runningJob && runningJob.status === "running") {
          // Show detailed live progress
          const elapsed = (Date.now() - runningJob.startTime) / 1000;
          const progress = runningJob.progress;

          // Calculate ETA
          const speed = elapsed > 0 ? progress.current / elapsed : 0;
          const remaining = progress.total - progress.current;
          const eta = speed > 0 ? remaining / speed : 0;

          // Create progress bar
          const barWidth = 30;
          const filled = Math.floor((progress.percentage / 100) * barWidth);
          const empty = barWidth - filled;
          const progressBar = "█".repeat(filled) + "░".repeat(empty);

          return {
            content: [
              {
                type: "text",
                text:
                  `🔄 Indexing in progress...\n\n` +
                  `📊 Live Progress:\n` +
                  `${progressBar} ${progress.percentage.toFixed(1)}%\n\n` +
                  `- Phase: ${progress.phase.toUpperCase()}\n` +
                  `- Progress: ${progress.current}/${progress.total}\n` +
                  `- Elapsed: ${elapsed.toFixed(0)}s\n` +
                  `- Speed: ${speed.toFixed(1)} items/s\n` +
                  `- ETA: ${eta > 0 ? eta.toFixed(0) + "s" : "calculating..."}\n` +
                  `- Job ID: ${runningJob.id}\n\n` +
                  `💡 Indexing continues in background. Check again to see updates.`,
              },
            ],
          };
        }

        // Show completed index stats
        if (!indexingService) {
          initServices(process.cwd());
        }

        const stats = await indexingService!.getStats();

        // Check for recently completed job
        const completedJob = backgroundJobs.getCurrentIndexingJob();
        const recentCompletion =
          completedJob &&
          completedJob.status === "completed" &&
          Date.now() - (completedJob.endTime || 0) < 60000;

        return {
          content: [
            {
              type: "text",
              text:
                `📊 Index Status:\n\n` +
                `- Collection exists: ${stats.collectionExists ? "✅" : "❌"}\n` +
                `- Total vectors: ${stats.vectorCount}\n` +
                `- Dimensions: ${stats.dimensions}\n\n` +
                (recentCompletion
                  ? `🎉 Indexing just completed!\n` +
                    `- Duration: ${((completedJob!.endTime! - completedJob!.startTime) / 1000).toFixed(1)}s\n` +
                    `- Result: ${completedJob!.result?.success ? "✅ Success" : "⚠️ Partial"}\n\n`
                  : "") +
                (stats.collectionExists
                  ? `✅ Index is ready for searching!`
                  : `⚠️ No index found. Run \`index_codebase\` first.`),
            },
          ],
        };
      }

      case "reindex_changed_files": {
        const path = String(args?.path || process.cwd());
        const specificFiles = args?.files as string[] | undefined;

        try {
          // Load config
          const configPath = `${path}/.semantica/config.json`;
          const projectConfig = loadConfig(configPath);

          // Create incremental service
          const incrementalService = new IncrementalIndexingService(
            projectConfig,
            path,
          );

          logProgress("🔄 Starting incremental re-index...");

          // Run incremental re-index
          const result =
            await incrementalService.reindexChangedFiles(specificFiles);

          const successText =
            result.errors.length === 0
              ? "✅ Successfully re-indexed!"
              : `⚠️ Re-indexed with ${result.errors.length} errors`;

          return {
            content: [
              {
                type: "text",
                text:
                  `${successText}\n\n` +
                  `📊 Incremental Re-Index Results:\n` +
                  `- Files processed: ${result.filesProcessed}\n` +
                  `- Chunks added: ${result.chunksAdded}\n` +
                  `- Chunks updated: ${result.chunksUpdated}\n` +
                  `- Chunks deleted: ${result.chunksDeleted}\n` +
                  `- Duration: ${(result.duration / 1000).toFixed(1)}s\n` +
                  `- Errors: ${result.errors.length}\n\n` +
                  `✅ Index is up to date!`,
              },
            ],
          };
        } catch (error) {
          debugLog("ERROR during reindex_changed_files:", error);
          throw error;
        }
      }

      case "enable_git_hooks": {
        const path = String(args?.path || process.cwd());
        const hooks = (args?.hooks as string[]) || [
          "post-checkout",
          "post-merge",
          "post-commit",
        ];

        try {
          const gitHookService = new GitHookService(path);

          if (!gitHookService.isGitRepo()) {
            return {
              content: [
                {
                  type: "text",
                  text: `❌ Not a git repository: ${path}\n\nGit hooks can only be installed in git repositories.`,
                },
              ],
            };
          }

          // Install requested hooks
          for (const hook of hooks) {
            await gitHookService.installHook(hook as any);
          }

          // Save current git state
          await gitHookService.saveGitState();

          return {
            content: [
              {
                type: "text",
                text:
                  `✅ Git hooks installed successfully!\n\n` +
                  `📋 Installed hooks:\n${hooks.map((h) => `  - ${h}`).join("\n")}\n\n` +
                  `🔄 Your codebase will now auto re-index on:\n` +
                  (hooks.includes("post-checkout")
                    ? `  - Branch switches\n`
                    : "") +
                  (hooks.includes("post-merge")
                    ? `  - Pull/merge operations\n`
                    : "") +
                  (hooks.includes("post-commit") ? `  - New commits\n` : "") +
                  `\n💡 Git hooks will trigger incremental re-indexing automatically.\n` +
                  `Use 'get_index_status' to monitor progress.`,
              },
            ],
          };
        } catch (error) {
          debugLog("ERROR during enable_git_hooks:", error);
          throw error;
        }
      }

      case "onboard_project": {
        const path = String(args?.path);
        const enableGitHooks = args?.enableGitHooks !== false;

        try {
          const onboardingService = new OnboardingService();

          logProgress("🚀 Starting project onboarding...\n");

          // Step 1: Detect project
          logProgress("📊 Analyzing project...");
          const projectInfo = await onboardingService.detectProject(path);

          logProgress(`   Name: ${projectInfo.name}`);
          logProgress(`   Languages: ${projectInfo.languages.join(", ")}`);
          logProgress(
            `   Size: ${projectInfo.size} (~${projectInfo.estimatedFiles} files)`,
          );
          logProgress(`   Git repo: ${projectInfo.isGitRepo ? "Yes" : "No"}`);

          // Step 2: Generate config
          logProgress("\n⚙️  Generating optimized config...");
          const config = onboardingService.generateConfig(projectInfo);
          onboardingService.saveConfig(path, config);

          // Step 3: Install git hooks
          let hooksInstalled = false;
          if (enableGitHooks && projectInfo.isGitRepo) {
            logProgress("\n🔗 Installing git hooks...");
            const gitHookService = new GitHookService(path);
            await gitHookService.installAll();
            await gitHookService.saveGitState();
            hooksInstalled = true;
          }

          // Step 4: Start initial indexing
          logProgress("\n📚 Starting initial indexing (background)...");
          const projectConfig = await import("./config/loader.js").then((m) =>
            m.loadConfig(join(path, ".semantica", "config.json")),
          );

          const indexingService = new IndexingService(projectConfig, path);
          const jobId = `index_${Date.now()}`;
          backgroundJobs.startJob(jobId, "indexing");

          indexingService
            .indexCodebase((progress) => {
              backgroundJobs.updateProgress(
                jobId,
                progress.phase,
                progress.current,
                progress.total,
              );
            })
            .then((result) => backgroundJobs.completeJob(jobId, result))
            .catch((error) =>
              backgroundJobs.failJob(
                jobId,
                error instanceof Error ? error.message : String(error),
              ),
            );

          return {
            content: [
              {
                type: "text",
                text:
                  `✅ Project onboarding complete!\n\n` +
                  `📊 Project: ${projectInfo.name}\n` +
                  `- Language: ${projectInfo.primaryLanguage}\n` +
                  `- Size: ${projectInfo.size}\n` +
                  `- Config: ${path}/.semantica/config.json\n` +
                  `- Git hooks: ${hooksInstalled ? "✅ Installed" : "❌ Skipped"}\n\n` +
                  `🚀 Initial indexing started (background)!\n` +
                  `- Job ID: ${jobId}\n` +
                  `- Estimated files: ~${projectInfo.estimatedFiles}\n\n` +
                  `💡 Use 'get_index_status' to monitor progress.`,
              },
            ],
          };
        } catch (error) {
          throw error;
        }
      }

      case "reset_state": {
        const path = String(args?.path || process.cwd());

        try {
          const resetService = new ResetStateService(path);
          const result = await resetService.resetState();

          const statusEmoji = result.errors.length === 0 ? "✅" : "⚠️";

          return {
            content: [
              {
                type: "text",
                text:
                  `${statusEmoji} State reset complete!\n\n` +
                  `📊 Cleanup Summary:\n` +
                  `- Processes killed: ${result.processesKilled}\n` +
                  `- Locks removed: ${result.locksRemoved}\n` +
                  `- State files removed: ${result.stateFilesRemoved}\n` +
                  `- Errors: ${result.errors.length}\n\n` +
                  (result.errors.length > 0
                    ? `⚠️  Errors:\n${result.errors.map((e) => `  - ${e}`).join("\n")}\n\n`
                    : "") +
                  `✅ System is clean and ready!\n` +
                  `You can now safely run indexing operations.`,
              },
            ],
          };
        } catch (error) {
          throw error;
        }
      }

      case "clear_index": {
        const confirm = Boolean(args?.confirm);

        if (!confirm) {
          return {
            content: [
              {
                type: "text",
                text: "⚠️ Confirmation required. Set confirm: true to clear the index.",
              },
            ],
          };
        }

        if (!indexingService) {
          initServices(process.cwd());
        }

        await indexingService!.clearIndex();

        return {
          content: [
            {
              type: "text",
              text: "✅ Index cleared successfully. All indexed data has been deleted.",
            },
          ],
        };
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    // Build detailed error message
    let errorMessage = error instanceof Error ? error.message : String(error);

    // Add stack trace for debugging
    let errorDetails = "";
    if (error instanceof Error && error.stack) {
      errorDetails = "\n\nStack trace:\n" + error.stack;
    }

    // Add cause if available
    if (error && typeof error === "object" && "cause" in error) {
      const cause = (error as any).cause;
      errorDetails +=
        "\n\nCaused by: " +
        (cause instanceof Error ? cause.message : String(cause));
      if (cause instanceof Error && cause.stack) {
        errorDetails += "\n" + cause.stack;
      }
    }

    return {
      content: [
        {
          type: "text",
          text: `❌ Error: ${errorMessage}${errorDetails}`,
        },
      ],
      isError: true,
    };
  }
});

/**
 * Start the MCP server.
 */
async function main() {
  logger.info("Starting Semantica Search MCP Server");

  const transport = new StdioServerTransport();
  await server.connect(transport);

  logger.info("Server started successfully");
  logger.info("Ready to accept requests");
}

main().catch((error) => {
  logger.error("Fatal error:", error);
  process.exit(1);
});
