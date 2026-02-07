/**
 * Reset State Service
 * Cleans up stuck processes, locks, and state files to recover from errors.
 */

import { execSync } from "child_process";
import { unlinkSync, existsSync, readdirSync, statSync } from "fs";
import { join } from "path";
import { getLogger } from "../utils/logger.js";
import { logProgress } from "../utils/progress.js";

const logger = getLogger();

/**
 * Reset result.
 */
export interface ResetResult {
  processesKilled: number;
  locksRemoved: number;
  stateFilesRemoved: number;
  errors: string[];
}

/**
 * Reset state service.
 */
export class ResetStateService {
  private projectRoot: string;

  constructor(projectRoot: string) {
    this.projectRoot = projectRoot;
  }

  /**
   * Reset all state and clean up stuck processes.
   */
  async resetState(): Promise<ResetResult> {
    const result: ResetResult = {
      processesKilled: 0,
      locksRemoved: 0,
      stateFilesRemoved: 0,
      errors: [],
    };

    logProgress("\n🔧 [RESET] Starting state reset...");

    // Step 1: Kill stuck re-index processes
    try {
      const processes = this.findStuckProcesses();
      logProgress(`   Found ${processes.length} stuck processes`);

      for (const pid of processes) {
        try {
          process.kill(pid, "SIGKILL");
          result.processesKilled++;
          logProgress(`   ✅ Killed process ${pid}`);
        } catch (error) {
          // Process might already be dead
        }
      }
    } catch (error) {
      result.errors.push(
        `Failed to kill processes: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    // Step 2: Remove lock files
    try {
      const lockFiles = [
        ".semantica/.indexing.lock",
        ".semantica/.search.lock",
        ".semantica/.reindex.lock",
      ];

      for (const lockFile of lockFiles) {
        const lockPath = join(this.projectRoot, lockFile);
        if (existsSync(lockPath)) {
          unlinkSync(lockPath);
          result.locksRemoved++;
          logProgress(`   ✅ Removed ${lockFile}`);
        }
      }
    } catch (error) {
      result.errors.push(
        `Failed to remove locks: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    // Step 3: Remove stale state files
    try {
      const stateFiles = [
        ".semantica/reindex-trigger.json",
        ".semantica/indexing-state.json",
        ".semantica/watch-state.json",
      ];

      for (const stateFile of stateFiles) {
        const statePath = join(this.projectRoot, stateFile);
        if (existsSync(statePath)) {
          unlinkSync(statePath);
          result.stateFilesRemoved++;
          logProgress(`   ✅ Removed ${stateFile}`);
        }
      }
    } catch (error) {
      result.errors.push(
        `Failed to remove state files: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    // Step 4: Clean old log files (keep only latest)
    try {
      const logPath = join(this.projectRoot, ".semantica", "reindex.log");
      if (existsSync(logPath)) {
        const stats = statSync(logPath);
        const sizeMB = stats.size / (1024 * 1024);

        if (sizeMB > 10) {
          // If log is >10MB, truncate it
          unlinkSync(logPath);
          logProgress(
            `   ✅ Truncated large log file (${sizeMB.toFixed(1)}MB)`,
          );
        }
      }
    } catch (error) {
      // Ignore log cleanup errors
    }

    logProgress(`\n✅ [RESET] Complete!`);
    logProgress(
      `   Processes killed: ${result.processesKilled} | Locks removed: ${result.locksRemoved} | State files: ${result.stateFilesRemoved}`,
    );

    if (result.errors.length > 0) {
      logProgress(`   ⚠️  Errors: ${result.errors.length}`);
    }

    return result;
  }

  /**
   * Find stuck re-index processes for this project.
   */
  private findStuckProcesses(): number[] {
    try {
      // Find all node processes running git-reindex.js for this project
      const output = execSync(
        `ps aux | grep "git-reindex.js" | grep "${this.projectRoot}" | grep -v grep | awk '{print $2}'`,
        { encoding: "utf-8" },
      );

      return output
        .split("\n")
        .filter((line) => line.length > 0)
        .map((pid) => parseInt(pid));
    } catch (error) {
      return [];
    }
  }

  /**
   * Check system health.
   */
  async checkHealth(): Promise<{
    ollama: boolean;
    milvus: boolean;
    issues: string[];
  }> {
    const issues: string[] = [];

    // Check Ollama
    let ollamaOk = false;
    try {
      const axios = (await import("axios")).default;
      await axios.get("http://localhost:11434/api/tags", { timeout: 5000 });
      ollamaOk = true;
    } catch (error) {
      issues.push("Ollama not running or not accessible at localhost:11434");
    }

    // Check Milvus
    let milvusOk = false;
    try {
      const axios = (await import("axios")).default;
      await axios.get("http://localhost:19530/healthz", { timeout: 5000 });
      milvusOk = true;
    } catch (error) {
      issues.push("Milvus not running or not accessible at localhost:19530");
    }

    return {
      ollama: ollamaOk,
      milvus: milvusOk,
      issues,
    };
  }
}
