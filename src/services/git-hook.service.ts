/**
 * Git Hook Service
 * Manages git hooks for automatic re-indexing.
 */

import { execSync } from "child_process";
import {
  writeFileSync,
  existsSync,
  mkdirSync,
  chmodSync,
  readFileSync,
} from "fs";
import { join, dirname } from "path";
import { getLogger } from "../utils/logger.js";
import { logProgress } from "../utils/progress.js";

const logger = getLogger();

/**
 * Git hook types.
 */
export type GitHookType = "post-checkout" | "post-merge" | "post-commit";

/**
 * Git state for tracking last indexed commit.
 */
interface GitState {
  branch: string;
  commit: string;
  lastIndexed: number;
}

/**
 * Git hook service.
 */
export class GitHookService {
  private projectRoot: string;
  private hooksDir: string;
  private stateFile: string;

  constructor(projectRoot: string) {
    this.projectRoot = projectRoot;
    this.hooksDir = join(projectRoot, ".git", "hooks");
    this.stateFile = join(projectRoot, ".semantica", "git-state.json");
  }

  /**
   * Check if project is a git repository.
   */
  isGitRepo(): boolean {
    return existsSync(join(this.projectRoot, ".git"));
  }

  /**
   * Get current git branch.
   */
  getCurrentBranch(): string {
    try {
      return execSync("git branch --show-current", {
        cwd: this.projectRoot,
        encoding: "utf-8",
      }).trim();
    } catch (error) {
      return "unknown";
    }
  }

  /**
   * Get current commit hash.
   */
  getCurrentCommit(): string {
    try {
      return execSync("git rev-parse HEAD", {
        cwd: this.projectRoot,
        encoding: "utf-8",
      }).trim();
    } catch (error) {
      return "unknown";
    }
  }

  /**
   * Get files changed between two commits.
   */
  getChangedFiles(fromCommit: string, toCommit: string): string[] {
    try {
      const diff = execSync(
        `git diff --name-only ${fromCommit}...${toCommit}`,
        {
          cwd: this.projectRoot,
          encoding: "utf-8",
        },
      );

      return diff
        .split("\n")
        .filter((f) => f.length > 0)
        .map((f) => join(this.projectRoot, f));
    } catch (error) {
      logger.error("Failed to get changed files", error);
      return [];
    }
  }

  /**
   * Install git hook.
   */
  async installHook(hookType: GitHookType): Promise<void> {
    if (!this.isGitRepo()) {
      throw new Error("Not a git repository");
    }

    const hookPath = join(this.hooksDir, hookType);
    const hookScript = this.getHookScript(hookType);

    // Create hooks directory if it doesn't exist
    if (!existsSync(this.hooksDir)) {
      mkdirSync(this.hooksDir, { recursive: true });
    }

    // Check if hook already exists
    if (existsSync(hookPath)) {
      const existing = readFileSync(hookPath, "utf-8");
      if (existing.includes("Semantica Search")) {
        logger.info(`Hook ${hookType} already installed`);
        return;
      }

      // Backup existing hook
      writeFileSync(hookPath + ".backup", existing);
      logger.info(`Backed up existing ${hookType} hook`);
    }

    // Write hook script
    writeFileSync(hookPath, hookScript);

    // Make executable
    chmodSync(hookPath, "755");

    logger.info(`Installed git hook: ${hookType}`);
    logProgress(`✅ Installed ${hookType} hook`);
  }

  /**
   * Install all recommended hooks.
   */
  async installAll(): Promise<void> {
    const hooks: GitHookType[] = ["post-checkout", "post-merge", "post-commit"];

    for (const hook of hooks) {
      await this.installHook(hook);
    }

    logProgress("✅ All git hooks installed!");
  }

  /**
   * Get git hook script content.
   */
  private getHookScript(hookType: GitHookType): string {
    const reindexScript =
      "/Users/huaanhminh/Projects/semantica-search-mcp/build/scripts/git-reindex.js";

    switch (hookType) {
      case "post-checkout":
        return `#!/bin/bash
# Semantica Search - Auto Re-Index on Branch Change
PREV_HEAD=$1
NEW_HEAD=$2
BRANCH_SWITCH=$3
if [ "$BRANCH_SWITCH" != "1" ]; then exit 0; fi
PROJECT_ROOT=$(git rev-parse --show-toplevel)
CHANGED=$(git diff --name-only $PREV_HEAD...$NEW_HEAD 2>/dev/null | wc -l)
if [ -z "$CHANGED" ] || [ "$CHANGED" -eq 0 ]; then exit 0; fi
echo "[Semantica] Branch changed: $CHANGED files, auto re-indexing..."
node ${reindexScript} "$PROJECT_ROOT" "post-checkout" "$CHANGED" > "$PROJECT_ROOT/.semantica/reindex.log" 2>&1 &
exit 0
`;

      case "post-merge":
        return `#!/bin/bash
# Semantica Search - Auto Re-Index After Merge/Pull
PROJECT_ROOT=$(git rev-parse --show-toplevel)
CHANGED=$(git diff --name-only HEAD@{1}..HEAD 2>/dev/null | wc -l)
if [ -z "$CHANGED" ] || [ "$CHANGED" -eq 0 ]; then exit 0; fi
echo "[Semantica] Merge: $CHANGED files changed, auto re-indexing..."
node ${reindexScript} "$PROJECT_ROOT" "post-merge" "$CHANGED" > "$PROJECT_ROOT/.semantica/reindex.log" 2>&1 &
exit 0
`;

      case "post-commit":
        return `#!/bin/bash
# Semantica Search - Auto Re-Index After Commit
PROJECT_ROOT=$(git rev-parse --show-toplevel)
CHANGED=$(git diff-tree --no-commit-id --name-only -r HEAD | wc -l)
if [ -z "$CHANGED" ] || [ "$CHANGED" -eq 0 ]; then exit 0; fi
echo "[Semantica] Commit: $CHANGED files, auto re-indexing..."
node ${reindexScript} "$PROJECT_ROOT" "post-commit" "$CHANGED" > "$PROJECT_ROOT/.semantica/reindex.log" 2>&1 &
exit 0
`;

      default:
        return "";
    }
  }

  /**
   * Save current git state.
   */
  async saveGitState(): Promise<void> {
    const state: GitState = {
      branch: this.getCurrentBranch(),
      commit: this.getCurrentCommit(),
      lastIndexed: Date.now(),
    };

    const stateDir = dirname(this.stateFile);
    if (!existsSync(stateDir)) {
      mkdirSync(stateDir, { recursive: true });
    }

    writeFileSync(this.stateFile, JSON.stringify(state, null, 2));
  }

  /**
   * Load git state.
   */
  async loadGitState(): Promise<GitState | null> {
    if (!existsSync(this.stateFile)) {
      return null;
    }

    try {
      return JSON.parse(readFileSync(this.stateFile, "utf-8"));
    } catch (error) {
      logger.error("Failed to load git state", error);
      return null;
    }
  }

  /**
   * Check if git state has changed (branch or commit).
   */
  async hasGitStateChanged(): Promise<{
    changed: boolean;
    changedFiles?: string[];
  }> {
    const oldState = await this.loadGitState();

    if (!oldState) {
      return { changed: false };
    }

    const currentBranch = this.getCurrentBranch();
    const currentCommit = this.getCurrentCommit();

    // Check if branch changed
    if (currentBranch !== oldState.branch) {
      const changedFiles = this.getChangedFiles(oldState.commit, currentCommit);

      return {
        changed: true,
        changedFiles,
      };
    }

    // Check if commit changed (new commits)
    if (currentCommit !== oldState.commit) {
      const changedFiles = this.getChangedFiles(oldState.commit, currentCommit);

      return {
        changed: true,
        changedFiles,
      };
    }

    return { changed: false };
  }
}
