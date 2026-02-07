/**
 * Onboarding Service
 * Automates setup for new projects: config creation, git hooks, initial indexing.
 */

import { writeFileSync, existsSync, mkdirSync, readdirSync } from "fs";
import { join } from "path";
import { GitHookService } from "./git-hook.service.js";
import { getLogger } from "../utils/logger.js";
import { logProgress } from "../utils/progress.js";

const logger = getLogger();

/**
 * Project size category.
 */
type ProjectSize = "small" | "medium" | "large" | "massive";

/**
 * Detected project info.
 */
interface ProjectInfo {
  name: string;
  root: string;
  primaryLanguage: string;
  languages: string[];
  estimatedFiles: number;
  size: ProjectSize;
  isGitRepo: boolean;
}

/**
 * Onboarding service.
 */
export class OnboardingService {
  /**
   * Detect project information.
   */
  async detectProject(projectRoot: string): Promise<ProjectInfo> {
    const name = projectRoot.split("/").pop() || "unknown";
    const gitHookService = new GitHookService(projectRoot);

    // Detect languages
    const languages = new Set<string>();
    const extensions = new Map<string, number>();

    // Sample files to detect languages
    this.sampleFiles(projectRoot, (file) => {
      const ext = file.substring(file.lastIndexOf("."));
      extensions.set(ext, (extensions.get(ext) || 0) + 1);
    });

    // Map extensions to languages
    for (const [ext, count] of extensions.entries()) {
      if ([".ts", ".tsx"].includes(ext)) languages.add("typescript");
      else if ([".js", ".jsx", ".mjs", ".cjs"].includes(ext))
        languages.add("javascript");
      else if (ext === ".rb") languages.add("ruby");
    }

    // Determine primary language (most files)
    let primaryLanguage = "typescript";
    let maxCount = 0;

    for (const [ext, count] of extensions.entries()) {
      if (count > maxCount) {
        maxCount = count;
        if ([".ts", ".tsx"].includes(ext)) primaryLanguage = "typescript";
        else if ([".js", ".jsx"].includes(ext)) primaryLanguage = "javascript";
        else if (ext === ".rb") primaryLanguage = "ruby";
      }
    }

    // Estimate file count and size
    const totalExtFiles = Array.from(extensions.values()).reduce(
      (a, b) => a + b,
      0,
    );
    const estimatedFiles = totalExtFiles * 10; // Rough estimate

    let size: ProjectSize;
    if (estimatedFiles < 500) size = "small";
    else if (estimatedFiles < 5000) size = "medium";
    else if (estimatedFiles < 30000) size = "large";
    else size = "massive";

    return {
      name,
      root: projectRoot,
      primaryLanguage,
      languages: Array.from(languages),
      estimatedFiles,
      size,
      isGitRepo: gitHookService.isGitRepo(),
    };
  }

  /**
   * Sample files in project (first 1000).
   */
  private sampleFiles(
    dir: string,
    callback: (file: string) => void,
    count = { value: 0 },
  ): void {
    if (count.value >= 1000) return;

    try {
      const entries = readdirSync(dir, { withFileTypes: true });

      for (const entry of entries) {
        if (count.value >= 1000) break;

        // Skip common ignore directories
        if (
          [
            "node_modules",
            ".git",
            "dist",
            "build",
            "coverage",
            "vendor",
          ].includes(entry.name)
        ) {
          continue;
        }

        const fullPath = join(dir, entry.name);

        if (entry.isDirectory()) {
          this.sampleFiles(fullPath, callback, count);
        } else if (entry.isFile()) {
          callback(fullPath);
          count.value++;
        }
      }
    } catch (error) {
      // Skip directories we can't read
    }
  }

  /**
   * Generate optimal config for project.
   */
  generateConfig(projectInfo: ProjectInfo): any {
    const baseConfig = {
      version: "1.0.0",
      project: {
        name: projectInfo.name,
        root: projectInfo.root,
        languages: projectInfo.languages,
      },
      indexing: {
        granularity: "hybrid",
        chunkingStrategy: "ast-split-merge",
        maxChunkSize: 250,
        chunking: {
          strategy: "ast-split-merge",
          maxTokens: 250,
          minTokens: 50,
          mergeSiblings: true,
        },
      },
      embedding: {
        provider: "ollama",
        model: "nomic-embed-text",
        dimensions: 768,
        ollama: {
          host: "http://localhost:11434",
          timeout: 30000,
        },
      },
      vectordb: {
        provider: "milvus",
        collectionName: projectInfo.name.replace(/[^a-z0-9_]/gi, "_"),
        milvus: {
          host: "localhost",
          port: 19530,
        },
      },
      search: {
        strategy: "hybrid",
        maxResults: 10,
        minScore: 0.5,
      },
      performance: {
        maxFileSize: "1MB",
        batchDelay: 0,
      },
    };

    // Adjust based on project size
    if (projectInfo.size === "small") {
      return {
        ...baseConfig,
        embedding: { ...baseConfig.embedding, batchSize: 32, concurrency: 3 },
        indexing: {
          ...baseConfig.indexing,
          include: ["src/**", "lib/**", "app/**"],
          exclude: ["node_modules/**", "**/*.test.*", "**/*.spec.*"],
        },
      };
    } else if (projectInfo.size === "medium") {
      return {
        ...baseConfig,
        embedding: { ...baseConfig.embedding, batchSize: 64, concurrency: 5 },
        indexing: {
          ...baseConfig.indexing,
          include:
            projectInfo.primaryLanguage === "ruby"
              ? ["app/models/**", "app/services/**", "lib/**"]
              : ["src/**", "lib/**", "packages/*/src/**"],
          exclude: [
            "node_modules/**",
            "**/*.test.*",
            "**/*.spec.*",
            "dist/**",
            "build/**",
            "spec/**",
            "test/**",
          ],
        },
      };
    } else {
      // Large or massive
      return {
        ...baseConfig,
        embedding: { ...baseConfig.embedding, batchSize: 64, concurrency: 5 },
        indexing: {
          ...baseConfig.indexing,
          include:
            projectInfo.primaryLanguage === "ruby"
              ? ["app/models/**", "app/services/**", "app/queries/**", "lib/**"]
              : ["packages/*/src/**", "apps/*/src/**", "src/**"],
          exclude: [
            "node_modules/**",
            "**/*.test.*",
            "**/*.spec.*",
            "**/__tests__/**",
            "**/*.stories.*",
            "**/*.d.ts",
            "dist/**",
            "build/**",
            "spec/**",
            "test/**",
            "vendor/**",
            "public/**",
          ],
        },
      };
    }
  }

  /**
   * Save config to project.
   */
  saveConfig(projectRoot: string, config: any): void {
    const configDir = join(projectRoot, ".semantica");
    const configPath = join(configDir, "config.json");

    if (!existsSync(configDir)) {
      mkdirSync(configDir, { recursive: true });
    }

    writeFileSync(configPath, JSON.stringify(config, null, 2));
    logProgress(`✅ Created config: ${configPath}`);
  }
}
