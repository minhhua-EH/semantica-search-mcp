/**
 * Merkle Tree Service for change detection.
 * Uses Merkle trees to efficiently detect file changes.
 */

import { createHash } from "crypto";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { getLogger } from "../utils/logger.js";

const logger = getLogger();

/**
 * File change types.
 */
export type ChangeType = "added" | "modified" | "deleted";

/**
 * File changes result.
 */
export interface FileChanges {
  added: string[];
  modified: string[];
  deleted: string[];
}

/**
 * Merkle tree node.
 */
interface MerkleNode {
  path: string;
  hash: string;
  isDirectory: boolean;
  children?: Map<string, MerkleNode>;
}

/**
 * Merkle tree snapshot.
 */
interface MerkleSnapshot {
  root: MerkleNode;
  timestamp: number;
  fileCount: number;
  totalHash: string;
}

/**
 * Merkle tree service for change detection.
 */
export class MerkleService {
  private projectRoot: string;
  private storePath: string;

  constructor(projectRoot: string, storePath: string = ".semantica/merkle") {
    this.projectRoot = projectRoot;
    this.storePath = join(projectRoot, storePath);

    // Ensure storage directory exists
    if (!existsSync(this.storePath)) {
      mkdirSync(this.storePath, { recursive: true });
    }
  }

  /**
   * Hash file content.
   */
  private hashFile(filePath: string): string {
    try {
      const content = readFileSync(filePath, "utf-8");
      return createHash("sha256").update(content).digest("hex");
    } catch (error) {
      logger.error(`Failed to hash file: ${filePath}`, error);
      return "";
    }
  }

  /**
   * Build Merkle tree for files.
   */
  buildTree(files: string[]): MerkleSnapshot {
    const fileHashes = new Map<string, string>();

    // Hash all files
    for (const file of files) {
      const hash = this.hashFile(file);
      if (hash) {
        fileHashes.set(file, hash);
      }
    }

    // Build tree (simplified: flat structure for now)
    const rootHash = this.combineHashes(Array.from(fileHashes.values()));

    const snapshot: MerkleSnapshot = {
      root: {
        path: this.projectRoot,
        hash: rootHash,
        isDirectory: true,
        children: new Map(
          Array.from(fileHashes.entries()).map(([path, hash]) => [
            path,
            {
              path,
              hash,
              isDirectory: false,
            },
          ]),
        ),
      },
      timestamp: Date.now(),
      fileCount: files.length,
      totalHash: rootHash,
    };

    return snapshot;
  }

  /**
   * Combine multiple hashes into one.
   */
  private combineHashes(hashes: string[]): string {
    const combined = hashes.sort().join("");
    return createHash("sha256").update(combined).digest("hex");
  }

  /**
   * Save Merkle tree snapshot to disk.
   */
  async saveSnapshot(snapshot: MerkleSnapshot): Promise<void> {
    const snapshotPath = join(this.storePath, "snapshot.json");

    // Convert Map to object for JSON serialization
    const serializable = {
      root: {
        ...snapshot.root,
        children: snapshot.root.children
          ? Object.fromEntries(snapshot.root.children)
          : undefined,
      },
      timestamp: snapshot.timestamp,
      fileCount: snapshot.fileCount,
      totalHash: snapshot.totalHash,
    };

    writeFileSync(snapshotPath, JSON.stringify(serializable, null, 2));
    logger.info(`Saved Merkle snapshot: ${snapshot.fileCount} files`);
  }

  /**
   * Load Merkle tree snapshot from disk.
   */
  async loadSnapshot(): Promise<MerkleSnapshot | null> {
    const snapshotPath = join(this.storePath, "snapshot.json");

    if (!existsSync(snapshotPath)) {
      return null;
    }

    try {
      const data = JSON.parse(readFileSync(snapshotPath, "utf-8"));

      // Convert object back to Map
      const snapshot: MerkleSnapshot = {
        root: {
          ...data.root,
          children: data.root.children
            ? new Map(Object.entries(data.root.children))
            : undefined,
        },
        timestamp: data.timestamp,
        fileCount: data.fileCount,
        totalHash: data.totalHash,
      };

      return snapshot;
    } catch (error) {
      logger.error("Failed to load Merkle snapshot", error);
      return null;
    }
  }

  /**
   * Detect changes between old and new file sets.
   */
  async detectChanges(currentFiles: string[]): Promise<FileChanges> {
    const oldSnapshot = await this.loadSnapshot();

    if (!oldSnapshot) {
      // No previous snapshot, all files are new
      return {
        added: currentFiles,
        modified: [],
        deleted: [],
      };
    }

    const changes: FileChanges = {
      added: [],
      modified: [],
      deleted: [],
    };

    const oldFiles = new Map(
      oldSnapshot.root.children
        ? Array.from(oldSnapshot.root.children.entries())
        : [],
    );
    const currentFileSet = new Set(currentFiles);

    // Check for added and modified files
    for (const file of currentFiles) {
      const oldNode = oldFiles.get(file);

      if (!oldNode) {
        // File is new
        changes.added.push(file);
      } else {
        // File exists, check if modified
        const currentHash = this.hashFile(file);
        if (currentHash !== oldNode.hash) {
          changes.modified.push(file);
        }
      }
    }

    // Check for deleted files
    for (const [file] of oldFiles) {
      if (!currentFileSet.has(file)) {
        changes.deleted.push(file);
      }
    }

    logger.info("Detected changes", {
      added: changes.added.length,
      modified: changes.modified.length,
      deleted: changes.deleted.length,
    });

    return changes;
  }

  /**
   * Update Merkle tree after re-indexing.
   */
  async updateTree(files: string[]): Promise<void> {
    const newSnapshot = this.buildTree(files);
    await this.saveSnapshot(newSnapshot);
  }
}
