/**
 * JavaScript parser using tree-sitter.
 * Extracts functions, classes, and methods.
 */

import Parser from "tree-sitter";
import JavaScript from "tree-sitter-javascript";
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
 * JavaScript parser using tree-sitter.
 */
export class JavaScriptParser extends BaseParser {
  readonly language = Language.JAVASCRIPT;
  readonly supportedChunkTypes = [
    ChunkType.FUNCTION,
    ChunkType.CLASS,
    ChunkType.METHOD,
  ];

  private parser: Parser;

  constructor() {
    super();
    this.parser = new Parser();
    this.parser.setLanguage(JavaScript);
  }

  /**
   * Check if parser can handle this file.
   */
  canParse(extension: string): boolean {
    return [".js", ".jsx", ".mjs", ".cjs"].includes(extension.toLowerCase());
  }

  /**
   * Parse JavaScript file content.
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
      case "generator_function":
      case "generator_function_declaration":
        return ChunkType.FUNCTION;

      case "class_declaration":
      case "class":
        return ChunkType.CLASS;

      case "method_definition":
        return ChunkType.METHOD;

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
        line: node.startPosition.row + 1,
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

    // For arrow functions and function expressions, check if they're assigned to a variable
    if (
      (node.type === "arrow_function" ||
        node.type === "function_expression" ||
        node.type === "function") &&
      node.parent
    ) {
      const parent = node.parent;

      // Check for variable declaration: const foo = () => {}
      if (parent.type === "variable_declarator") {
        const nameNode = parent.childForFieldName("name");
        if (nameNode) {
          return nameNode.text;
        }
      }

      // Check for property assignment: obj.foo = () => {}
      if (parent.type === "assignment_expression") {
        const left = parent.childForFieldName("left");
        if (left) {
          return left.text;
        }
      }
    }

    // For class methods, get the method name
    if (node.type === "method_definition") {
      const nameNode = node.childForFieldName("name");
      if (nameNode) {
        return nameNode.text;
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
}
