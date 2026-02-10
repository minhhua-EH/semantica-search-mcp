/**
 * File service for discovering and filtering files in a codebase.
 */

import glob from "fast-glob";
import { statSync, readFileSync } from "fs";
import { relative, extname } from "path";
import * as ignoreModule from "ignore";
import type { IndexingConfig, PerformanceConfig } from "../config/schema.js";
import { Language } from "../models/types.js";
import { FileNotFoundError, FileTooLargeError } from "../utils/errors.js";
import { getLogger } from "../utils/logger.js";

const logger = getLogger();

/**
 * File information.
 */
export interface FileInfo {
  /** Absolute path */
  absolutePath: string;

  /** Relative path from project root */
  relativePath: string;

  /** File extension */
  extension: string;

  /** Detected language */
  language: Language | null;

  /** File size in bytes */
  size: number;

  /** Last modified timestamp */
  lastModified: Date;
}

/**
 * File service for codebase scanning.
 */
export class FileService {
  private projectRoot: string;
  private config: IndexingConfig;
  private performanceConfig: PerformanceConfig;
  private ignoreFilter: any = null;

  constructor(
    projectRoot: string,
    config: IndexingConfig,
    performanceConfig: PerformanceConfig,
  ) {
    this.projectRoot = projectRoot;
    this.config = config;
    this.performanceConfig = performanceConfig;
    this.loadGitignore();
  }

  /**
   * Load .gitignore patterns.
   */
  private loadGitignore(): void {
    try {
      const gitignorePath = `${this.projectRoot}/.gitignore`;
      const content = readFileSync(gitignorePath, "utf-8");
      const ig = (ignoreModule as any).default();
      this.ignoreFilter = ig.add(content);
      logger.debug("Loaded .gitignore patterns");
    } catch (error) {
      // .gitignore doesn't exist or can't be read - that's okay
      logger.debug(".gitignore not found, skipping");
    }
  }

  /**
   * Discover all files in the project matching include/exclude patterns.
   */
  async discoverFiles(): Promise<FileInfo[]> {
    logger.info("Discovering files", {
      root: this.projectRoot,
      include: this.config.include,
      exclude: this.config.exclude,
    });

    // Use fast-glob to find files
    const files = await glob(this.config.include, {
      cwd: this.projectRoot,
      ignore: this.config.exclude,
      absolute: true,
      onlyFiles: true,
      followSymbolicLinks: false,
    });

    logger.info(`Found ${files.length} files`);

    // Filter by .gitignore and collect file info
    const fileInfos: FileInfo[] = [];

    for (const absolutePath of files) {
      const relativePath = relative(this.projectRoot, absolutePath);

      // Check .gitignore
      if (this.ignoreFilter && this.ignoreFilter.ignores(relativePath)) {
        logger.debug(`Ignored by .gitignore: ${relativePath}`);
        continue;
      }

      try {
        const info = this.getFileInfo(absolutePath, relativePath);

        // Skip files with unsupported language (e.g., .csv, .yml, .json)
        if (info.language === null) {
          logger.debug(
            `Unsupported file type, skipping: ${relativePath} (${info.extension})`,
          );
          continue;
        }

        // Check file size
        const maxSize = this.parseFileSize(this.performanceConfig.maxFileSize);
        if (info.size > maxSize) {
          logger.warn(`File too large, skipping: ${relativePath}`, {
            size: info.size,
            maxSize,
          });
          continue;
        }

        fileInfos.push(info);
      } catch (error) {
        logger.error(`Failed to get info for ${relativePath}`, error);
        continue;
      }
    }

    logger.info(`Discovered ${fileInfos.length} files after filtering`);
    return fileInfos;
  }

  /**
   * Get information about a single file.
   */
  getFileInfo(absolutePath: string, relativePath?: string): FileInfo {
    try {
      const stats = statSync(absolutePath);
      const ext = extname(absolutePath);
      const relPath = relativePath || relative(this.projectRoot, absolutePath);

      return {
        absolutePath,
        relativePath: relPath,
        extension: ext,
        language: this.detectLanguage(ext),
        size: stats.size,
        lastModified: stats.mtime,
      };
    } catch (error) {
      throw new FileNotFoundError(absolutePath);
    }
  }

  /**
   * Detect language from file extension.
   */
  detectLanguage(extension: string): Language | null {
    const ext = extension.toLowerCase();

    // Check language config
    for (const [lang, config] of Object.entries(this.config.languageConfig)) {
      if (config.extensions.includes(ext)) {
        return lang as Language;
      }
    }

    // Fallback to common extensions
    switch (ext) {
      case ".ts":
      case ".tsx":
        return Language.TYPESCRIPT;
      case ".js":
      case ".jsx":
        return Language.JAVASCRIPT;
      case ".rb":
        return Language.RUBY;
      case ".py":
        return Language.PYTHON;
      case ".go":
        return Language.GO;
      case ".java":
        return Language.JAVA;
      default:
        return null;
    }
  }

  /**
   * Parse file size string (e.g., "1MB", "500KB") to bytes.
   */
  private parseFileSize(sizeStr: string): number {
    const match = sizeStr.match(/^(\d+(?:\.\d+)?)(KB|MB|GB)$/i);
    if (!match) {
      throw new Error(`Invalid file size format: ${sizeStr}`);
    }

    const value = parseFloat(match[1]);
    const unit = match[2].toUpperCase();

    switch (unit) {
      case "KB":
        return value * 1024;
      case "MB":
        return value * 1024 * 1024;
      case "GB":
        return value * 1024 * 1024 * 1024;
      default:
        return value;
    }
  }

  /**
   * Read file content.
   */
  readFile(filePath: string): string {
    try {
      return readFileSync(filePath, "utf-8");
    } catch (error) {
      throw new FileNotFoundError(filePath);
    }
  }

  /**
   * Filter files by language.
   */
  filterByLanguage(files: FileInfo[], languages: Language[]): FileInfo[] {
    return files.filter((f) => f.language && languages.includes(f.language));
  }

  /**
   * Get file statistics.
   */
  getStats(files: FileInfo[]): {
    totalFiles: number;
    totalSize: number;
    byLanguage: Record<string, number>;
  } {
    const stats = {
      totalFiles: files.length,
      totalSize: files.reduce((sum, f) => sum + f.size, 0),
      byLanguage: {} as Record<string, number>,
    };

    for (const file of files) {
      if (file.language) {
        stats.byLanguage[file.language] =
          (stats.byLanguage[file.language] || 0) + 1;
      }
    }

    return stats;
  }
}
