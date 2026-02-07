/**
 * AST Split-Merge Chunker
 *
 * Based on research from https://arxiv.org/html/2506.15655v1
 *
 * Algorithm:
 * 1. Split: If node > maxTokens, recursively split children
 * 2. Merge: If siblings combined < maxTokens, merge them
 * 3. Preserve syntactic boundaries (functions, classes stay intact)
 */

import { BaseChunker, type ChunkerNode, type ChunkingOptions } from "./base.js";
import type { CodeNode } from "../parsers/base.js";
import type { CodeChunk } from "../models/code-chunk.js";
import { countTokens } from "../utils/token-counter.js";

export class ASTSplitMergeChunker extends BaseChunker {
  getName(): string {
    return "ast-split-merge";
  }

  /**
   * Main chunking algorithm.
   */
  chunk(
    nodes: CodeNode[],
    options: ChunkingOptions,
    filePath: string,
    language: string,
  ): CodeChunk[] {
    // Convert CodeNodes to ChunkerNodes
    const chunkerNodes = nodes.map((n) => this.toChunkerNode(n));

    // Step 1: Split large nodes recursively
    const splitNodes = this.splitPhase(chunkerNodes, options.maxTokens);

    // Step 2: Merge small adjacent nodes
    const mergedNodes = options.mergeSiblings
      ? this.mergePhase(splitNodes, options.maxTokens, options.minTokens || 50)
      : splitNodes;

    // Step 3: Convert to CodeChunks
    const chunks: CodeChunk[] = [];
    for (const node of mergedNodes) {
      const chunk = this.createChunk(node, filePath, language);
      chunks.push(chunk);
    }

    return chunks;
  }

  /**
   * Split Phase: Recursively split nodes that exceed maxTokens.
   */
  private splitPhase(nodes: ChunkerNode[], maxTokens: number): ChunkerNode[] {
    const result: ChunkerNode[] = [];

    for (const node of nodes) {
      const tokens = countTokens(node.content);

      if (tokens <= maxTokens) {
        // Node is small enough, keep as-is
        result.push(node);
      } else if (node.children && node.children.length > 0) {
        // Node is too large and has children, split recursively
        const splitChildren = this.splitPhase(node.children, maxTokens);
        result.push(...splitChildren);
      } else {
        // Node is too large but has no children (atomic)
        // Split by lines as fallback
        const splitByLines = this.splitAtomicNode(node, maxTokens);
        result.push(...splitByLines);
      }
    }

    return result;
  }

  /**
   * Merge Phase: Merge small adjacent nodes.
   */
  private mergePhase(
    nodes: ChunkerNode[],
    maxTokens: number,
    minTokens: number,
  ): ChunkerNode[] {
    if (nodes.length === 0) return [];

    const result: ChunkerNode[] = [];
    let currentGroup: ChunkerNode[] = [nodes[0]];
    let currentTokens = countTokens(nodes[0].content);

    for (let i = 1; i < nodes.length; i++) {
      const node = nodes[i];
      const nodeTokens = countTokens(node.content);

      // Check if we can merge with current group
      const combinedTokens = currentTokens + nodeTokens;

      if (combinedTokens <= maxTokens && this.canMerge(currentGroup, node)) {
        // Merge with current group
        currentGroup.push(node);
        currentTokens = combinedTokens;
      } else {
        // Can't merge, finalize current group
        if (currentGroup.length === 1) {
          result.push(currentGroup[0]);
        } else {
          const merged = this.mergeNodes(currentGroup);
          result.push(merged);
        }

        // Start new group
        currentGroup = [node];
        currentTokens = nodeTokens;
      }
    }

    // Finalize last group
    if (currentGroup.length === 1) {
      result.push(currentGroup[0]);
    } else {
      const merged = this.mergeNodes(currentGroup);
      result.push(merged);
    }

    return result;
  }

  /**
   * Check if two nodes can be merged (are siblings/adjacent).
   */
  private canMerge(group: ChunkerNode[], node: ChunkerNode): boolean {
    if (group.length === 0) return true;

    const lastNode = group[group.length - 1];

    // Check if nodes are from same file (have same parent conceptually)
    // For now, we'll merge if they're adjacent in line numbers
    const gap = node.startLine - lastNode.endLine;

    // Allow small gaps (comments, blank lines)
    return gap <= 3;
  }

  /**
   * Merge multiple nodes into a single node.
   */
  private mergeNodes(nodes: ChunkerNode[]): ChunkerNode {
    if (nodes.length === 1) return nodes[0];

    const first = nodes[0];
    const last = nodes[nodes.length - 1];

    // Combine content
    const combinedContent = nodes.map((n) => n.content).join("\n\n");

    // Create merged node
    const merged: ChunkerNode = {
      type: nodes[0].type,
      name: nodes
        .map((n) => n.name)
        .filter(Boolean)
        .join(", "),
      content: combinedContent,
      startLine: first.startLine,
      endLine: last.endLine,
      startChar: first.startChar,
      endChar: last.endChar,
      children: [],
    };

    return merged;
  }

  /**
   * Split atomic node (no children) by lines.
   * Used when a single function/method is too large.
   */
  private splitAtomicNode(node: ChunkerNode, maxTokens: number): ChunkerNode[] {
    const lines = node.content.split("\n");
    const result: ChunkerNode[] = [];

    let currentLines: string[] = [];
    let currentTokens = 0;
    let startLine = node.startLine;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineTokens = countTokens(line);

      if (currentTokens + lineTokens > maxTokens && currentLines.length > 0) {
        // Finalize current chunk
        const content = currentLines.join("\n");
        const chunk: ChunkerNode = {
          type: node.type,
          name: node.name,
          content,
          startLine,
          endLine: startLine + currentLines.length - 1,
          startChar: node.startChar,
          endChar: node.endChar,
          children: [],
        };
        result.push(chunk);

        // Start new chunk
        currentLines = [line];
        currentTokens = lineTokens;
        startLine = node.startLine + i;
      } else {
        currentLines.push(line);
        currentTokens += lineTokens;
      }
    }

    // Add final chunk
    if (currentLines.length > 0) {
      const content = currentLines.join("\n");
      const chunk: ChunkerNode = {
        type: node.type,
        name: node.name,
        content,
        startLine,
        endLine: startLine + currentLines.length - 1,
        startChar: node.startChar,
        endChar: node.endChar,
        children: [],
      };
      result.push(chunk);
    }

    return result;
  }

  /**
   * Estimate tokens for a node (with caching for performance).
   */
  private getNodeTokens(node: ChunkerNode): number {
    return countTokens(node.content);
  }
}
