/**
 * TypeScript parser using tree-sitter.
 * Extracts functions, classes, interfaces, and types.
 */

import Parser from "tree-sitter";
import TypeScript from "tree-sitter-typescript";
import { v4 as uuidv4 } from "uuid";
import { BaseParser, ParseResult, ParseOptions, CodeNode } from "./base.js";
import { Language, ChunkType } from "../models/types.js";
import {
  CodeChunk,
  createCodeChunk,
  extractKeywords,
  extractDependencies,
} from "../models/code-chunk.js";
import { countTokens } from "../utils/token-counter.js";
import { getLogger } from "../utils/logger.js";
import { createChunker } from "../chunkers/factory.js";
import { ChunkingStrategy } from "../models/types.js";

const logger = getLogger();

/**
 * TypeScript parser using tree-sitter.
 */
export class TypeScriptParser extends BaseParser {
  readonly language = Language.TYPESCRIPT;
  readonly supportedChunkTypes = [
    ChunkType.FUNCTION,
    ChunkType.CLASS,
    ChunkType.INTERFACE,
    ChunkType.TYPE,
    ChunkType.METHOD,
  ];

  private parser: Parser;

  constructor() {
    super();
    this.parser = new Parser();
    this.parser.setLanguage(TypeScript.typescript);
  }

  /**
   * Check if parser can handle this file.
   */
  canParse(extension: string): boolean {
    return [".ts", ".tsx"].includes(extension.toLowerCase());
  }

  /**
   * Parse TypeScript file content.
   */
  async parse(
    content: string,
    filePath: string,
    options?: ParseOptions,
  ): Promise<ParseResult> {
    const startTime = Date.now();
    const chunks: CodeChunk[] = [];
    const errors: any[] = [];

    try {
      // Parse with tree-sitter
      const tree = this.parser.parse(content);

      // Extract nodes based on options
      const nodes = this.extractNodes(tree.rootNode, content, options);

      // Use chunker to optimize chunks (split large, merge small)
      const chunker = createChunker(ChunkingStrategy.AST_SPLIT_MERGE);
      const optimizedChunks = chunker.chunk(
        nodes,
        {
          maxTokens: options?.maxChunkSize || 250,
          minTokens: 50,
          mergeSiblings: true,
          preserveHierarchy: true,
        },
        filePath,
        this.language,
      );

      // Set absolute paths and update metadata
      for (const chunk of optimizedChunks) {
        chunk.metadata.absolutePath = filePath;
        chunks.push(chunk);
      }

      logger.debug(
        `Parsed ${filePath}: ${nodes.length} nodes → ${chunks.length} optimized chunks`,
      );
    } catch (error) {
      logger.error(`Failed to parse ${filePath}`, error);
      errors.push({
        message: error instanceof Error ? error.message : String(error),
      });
    }

    const parseTime = Date.now() - startTime;

    return {
      chunks,
      errors,
      metadata: {
        totalLines: this.countLines(content),
        totalChars: content.length,
        chunkTypes: Array.from(
          new Set(chunks.map((c) => c.metadata.chunkType)),
        ),
        parseTime,
      },
    };
  }

  /**
   * Extract nodes from AST.
   */
  private extractNodes(
    root: Parser.SyntaxNode,
    content: string,
    options?: ParseOptions,
  ): CodeNode[] {
    const nodes: CodeNode[] = [];
    const targetTypes = options?.chunkTypes || this.supportedChunkTypes;

    // Walk the AST
    this.walkTree(root, (node) => {
      const nodeType = this.getNodeChunkType(node);

      if (nodeType && targetTypes.includes(nodeType)) {
        const codeNode = this.extractCodeNode(node, content);
        if (codeNode) {
          nodes.push(codeNode);
        }
      }
    });

    return nodes;
  }

  /**
   * Get chunk type for AST node.
   */
  private getNodeChunkType(node: Parser.SyntaxNode): ChunkType | null {
    switch (node.type) {
      case "function_declaration":
      case "function":
      case "arrow_function":
      case "function_expression":
        return ChunkType.FUNCTION;

      case "class_declaration":
      case "class":
        return ChunkType.CLASS;

      case "method_definition":
        return ChunkType.METHOD;

      case "interface_declaration":
        return ChunkType.INTERFACE;

      case "type_alias_declaration":
        return ChunkType.TYPE;

      default:
        return null;
    }
  }

  /**
   * Extract code node from AST node.
   */
  private extractCodeNode(
    node: Parser.SyntaxNode,
    content: string,
  ): CodeNode | null {
    const name = this.extractNodeName(node);
    if (!name) {
      return null;
    }

    return {
      type: this.getNodeChunkType(node)!,
      name,
      content: content.substring(node.startIndex, node.endIndex),
      startPosition: {
        line: node.startPosition.row + 1, // Convert to 1-indexed
        column: node.startPosition.column,
      },
      endPosition: {
        line: node.endPosition.row + 1,
        column: node.endPosition.column,
      },
    };
  }

  /**
   * Extract name from AST node.
   */
  private extractNodeName(node: Parser.SyntaxNode): string | null {
    // Try to find identifier child
    const identifier = node.childForFieldName("name");
    if (identifier) {
      return identifier.text;
    }

    // For arrow functions, try to find variable name
    if (node.type === "arrow_function" && node.parent) {
      const parent = node.parent;
      if (parent.type === "variable_declarator") {
        const nameNode = parent.childForFieldName("name");
        if (nameNode) {
          return nameNode.text;
        }
      }
    }

    return null;
  }

  /**
   * Walk AST tree and call callback for each node.
   */
  private walkTree(
    node: Parser.SyntaxNode,
    callback: (node: Parser.SyntaxNode) => void,
  ): void {
    callback(node);

    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i);
      if (child) {
        this.walkTree(child, callback);
      }
    }
  }

  /**
   * Convert code node to chunk.
   */
  private nodeToChunk(
    node: CodeNode,
    filePath: string,
    fullContent: string,
  ): CodeChunk {
    const keywords = extractKeywords(node.content);
    const dependencies = extractDependencies(fullContent, "typescript");

    return createCodeChunk(uuidv4(), node.content, {
      filePath,
      absolutePath: filePath, // Will be set by calling service
      language: "typescript",
      startLine: node.startPosition.line,
      endLine: node.endPosition.line,
      startChar: 0, // Tree-sitter doesn't provide character offsets easily
      endChar: node.content.length,
      chunkType: node.type,
      granularity: "function", // Will be set by chunking strategy
      symbolName: node.name,
      symbolType: node.type,
      lastModified: new Date(),
      keywords,
      dependencies,
      tokenCount: countTokens(node.content),
    });
  }
}
