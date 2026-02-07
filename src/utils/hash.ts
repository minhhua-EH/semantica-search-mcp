/**
 * Hashing utilities for file change detection and Merkle trees.
 */

import { createHash } from "crypto";
import { readFileSync } from "fs";

/**
 * Hash algorithm type.
 */
export type HashAlgorithm = "md5" | "sha1" | "sha256" | "sha512";

/**
 * Generate hash of a string.
 */
export function hashString(
  content: string,
  algorithm: HashAlgorithm = "sha256",
): string {
  return createHash(algorithm).update(content).digest("hex");
}

/**
 * Generate hash of a file.
 */
export function hashFile(
  filePath: string,
  algorithm: HashAlgorithm = "sha256",
): string {
  const content = readFileSync(filePath);
  return createHash(algorithm).update(content).digest("hex");
}

/**
 * Generate hash of multiple strings (combined).
 */
export function hashStrings(
  strings: string[],
  algorithm: HashAlgorithm = "sha256",
): string {
  const combined = strings.join("");
  return hashString(combined, algorithm);
}

/**
 * Generate content-based hash (for deduplication).
 */
export function contentHash(content: string): string {
  // Use faster MD5 for content-based hashing
  return hashString(content, "md5");
}

/**
 * Merkle tree node.
 */
export interface MerkleNode {
  hash: string;
  path?: string;
  children?: MerkleNode[];
}

/**
 * Build a simple Merkle tree from file hashes.
 */
export function buildMerkleTree(fileHashes: Map<string, string>): MerkleNode {
  const leaves: MerkleNode[] = Array.from(fileHashes.entries()).map(
    ([path, hash]) => ({
      hash,
      path,
    }),
  );

  return buildMerkleTreeFromNodes(leaves);
}

/**
 * Build Merkle tree from leaf nodes.
 */
function buildMerkleTreeFromNodes(nodes: MerkleNode[]): MerkleNode {
  if (nodes.length === 0) {
    return { hash: hashString("") };
  }

  if (nodes.length === 1) {
    return nodes[0];
  }

  // Pair up nodes and hash them together
  const parents: MerkleNode[] = [];

  for (let i = 0; i < nodes.length; i += 2) {
    if (i + 1 < nodes.length) {
      // Hash pair
      const combined = nodes[i].hash + nodes[i + 1].hash;
      parents.push({
        hash: hashString(combined),
        children: [nodes[i], nodes[i + 1]],
      });
    } else {
      // Odd node out - promote to parent
      parents.push(nodes[i]);
    }
  }

  // Recursively build tree
  return buildMerkleTreeFromNodes(parents);
}

/**
 * Compare two Merkle trees and find changed files.
 */
export function compareMerkleTrees(
  oldTree: Map<string, string>,
  newTree: Map<string, string>,
): {
  added: string[];
  modified: string[];
  deleted: string[];
} {
  const added: string[] = [];
  const modified: string[] = [];
  const deleted: string[] = [];

  // Find added and modified files
  for (const [path, hash] of newTree.entries()) {
    if (!oldTree.has(path)) {
      added.push(path);
    } else if (oldTree.get(path) !== hash) {
      modified.push(path);
    }
  }

  // Find deleted files
  for (const path of oldTree.keys()) {
    if (!newTree.has(path)) {
      deleted.push(path);
    }
  }

  return { added, modified, deleted };
}

/**
 * Serialize Merkle tree to JSON.
 */
export function serializeMerkleTree(tree: Map<string, string>): string {
  return JSON.stringify(Object.fromEntries(tree));
}

/**
 * Deserialize Merkle tree from JSON.
 */
export function deserializeMerkleTree(json: string): Map<string, string> {
  const obj = JSON.parse(json);
  return new Map(Object.entries(obj));
}
