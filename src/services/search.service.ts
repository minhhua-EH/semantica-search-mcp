/**
 * Search service - handles semantic code search.
 * Query → Embed → Search → Format → Return
 */

import type { Config } from "../config/schema.js";
import { createEmbeddingProvider } from "../providers/embedding/factory.js";
import { createVectorDBProvider } from "../providers/vectordb/factory.js";
import type { EmbeddingProvider } from "../providers/embedding/base.js";
import type { VectorDBProvider } from "../providers/vectordb/base.js";
import type { SearchResult as VectorSearchResult } from "../models/vector.js";
import { SearchResultFormat, SearchStrategy } from "../models/types.js";
import { getLogger } from "../utils/logger.js";
import { SearchError } from "../utils/errors.js";
import { extractKeywords } from "../models/code-chunk.js";
import { preprocessQuery, expandQuery } from "../utils/query-expander.js";
import { extractTopKeywords } from "../utils/tfidf.js";

const logger = getLogger();

/**
 * Search result with formatted content.
 */
export interface SearchResult {
  /** Chunk ID */
  id: string;

  /** Code content */
  content: string;

  /** File path */
  filePath: string;

  /** Language */
  language: string;

  /** Line range */
  lines: { start: number; end: number };

  /** Similarity score (0-1) */
  score: number;

  /** Rank in results */
  rank: number;

  /** Metadata */
  metadata: Record<string, any>;

  /** Formatted snippet (based on result format) */
  snippet?: string;

  /** Context (surrounding code) */
  context?: string;
}

/**
 * Search options.
 */
export interface SearchOptions {
  /** Maximum results */
  maxResults?: number;

  /** Minimum score threshold */
  minScore?: number;

  /** Filter by language */
  language?: string;

  /** Filter by file path pattern */
  pathPattern?: string;

  /** Result format override */
  resultFormat?: SearchResultFormat;
}

/**
 * Search service.
 */
export class SearchService {
  private config: Config;
  private embeddingProvider: EmbeddingProvider;
  private vectorDBProvider: VectorDBProvider;

  constructor(config: Config) {
    this.config = config;
    this.embeddingProvider = createEmbeddingProvider(config.embedding);
    this.vectorDBProvider = createVectorDBProvider(config.vectordb);
  }

  /**
   * Search codebase with semantic query.
   */
  async search(
    query: string,
    options?: SearchOptions,
  ): Promise<SearchResult[]> {
    try {
      // Step 1: Preprocess query
      const processedQuery = preprocessQuery(query);
      logger.info(`Searching for: "${query}" (processed: "${processedQuery}")`);

      // Step 2: Try search with processed query
      let results = await this.searchWithQuery(processedQuery, options);

      // Step 3: If no results, try progressive fallback
      if (results.length === 0) {
        logger.info("No results found, trying query expansion...");

        // Try expanded queries
        const expandedQueries = expandQuery(processedQuery);
        logger.debug(`Expanded to ${expandedQueries.length} query variations`);

        for (const expandedQuery of expandedQueries) {
          if (expandedQuery === processedQuery) continue; // Skip original

          results = await this.searchWithQuery(expandedQuery, {
            ...options,
            minScore: (options?.minScore || this.config.search.minScore) * 0.8, // Lower threshold
          });

          if (results.length > 0) {
            logger.info(
              `Found results with expanded query: "${expandedQuery}"`,
            );
            break;
          }
        }
      }

      // Step 4: If still no results, try with very low threshold
      if (results.length === 0) {
        logger.info("Still no results, trying with lower threshold...");
        results = await this.searchWithQuery(processedQuery, {
          ...options,
          minScore: 0.3, // Very permissive
        });

        if (results.length > 0) {
          logger.info(`Found ${results.length} results with relaxed threshold`);
        }
      }

      logger.info(`Returning ${results.length} final results`);
      return results;
    } catch (error) {
      logger.error("Search failed", error);
      throw new SearchError(
        "Failed to search codebase",
        error instanceof Error ? { cause: error } : { error },
      );
    }
  }

  /**
   * Search with a specific query string.
   */
  private async searchWithQuery(
    query: string,
    options?: SearchOptions,
  ): Promise<SearchResult[]> {
    // Step 1: Embed query
    const queryEmbedding = await this.embeddingProvider.embed(query);
    logger.debug("Query embedded", { dimensions: queryEmbedding.length });

    // Step 2: Prepare search options
    const maxResults = options?.maxResults || this.config.search.maxResults;
    const minScore = options?.minScore || this.config.search.minScore;

    // Build metadata filters
    const filters: Record<string, any> = {};
    if (options?.language) {
      filters.language = options.language;
    }

    // Step 3: Search vector database
    await this.vectorDBProvider.connect();

    const vectorResults = await this.vectorDBProvider.search(
      this.config.vectordb.collectionName,
      queryEmbedding,
      {
        limit: maxResults,
        minScore,
        filters: Object.keys(filters).length > 0 ? filters : undefined,
      },
    );

    logger.debug(`Found ${vectorResults.length} vector results`);

    // Step 4: Apply keyword filtering if hybrid search
    const filteredResults = this.applyHybridSearch(
      query,
      vectorResults,
      this.config.search.strategy,
    );

    // Step 5: Format results
    const formattedResults = await this.formatResults(
      filteredResults,
      options?.resultFormat || this.config.search.resultFormat,
    );

    // Step 6: Apply path pattern filter if specified
    const finalResults = options?.pathPattern
      ? this.filterByPathPattern(formattedResults, options.pathPattern)
      : formattedResults;

    return finalResults;
  }

  /**
   * Apply hybrid search (combine vector + keyword scores).
   */
  private applyHybridSearch(
    query: string,
    results: VectorSearchResult[],
    strategy: SearchStrategy,
  ): VectorSearchResult[] {
    if (strategy !== SearchStrategy.HYBRID) {
      return results;
    }

    // Extract keywords from query using TF-IDF
    const queryKeywords = extractTopKeywords(query.toLowerCase(), [], 10);

    // Determine query type and adjust weights dynamically
    const { vectorWeight, keywordWeight } = this.calculateDynamicWeights(query);

    logger.debug(
      `Dynamic weights: vector=${vectorWeight.toFixed(2)}, keyword=${keywordWeight.toFixed(2)}`,
    );

    // Re-score results based on keyword matching
    const hybridResults = results.map((result) => {
      const chunkKeywords = result.metadata.keywords || [];
      const keywordScore = this.calculateKeywordScore(
        queryKeywords,
        chunkKeywords,
      );

      // Combine scores with dynamic weights
      const hybridScore =
        result.score * vectorWeight + keywordScore * keywordWeight;

      return {
        ...result,
        score: hybridScore,
      };
    });

    // Re-sort by hybrid score
    return hybridResults.sort((a, b) => b.score - a.score);
  }

  /**
   * Calculate dynamic weights based on query characteristics.
   */
  private calculateDynamicWeights(query: string): {
    vectorWeight: number;
    keywordWeight: number;
  } {
    // Default weights from config
    let vectorWeight = this.config.search.hybrid?.vectorWeight || 0.7;
    let keywordWeight = this.config.search.hybrid?.keywordWeight || 0.3;

    // Detect query type
    const hasCodePatterns = /[{}()\[\];,.<>]/g.test(query); // Has code syntax
    const hasOperators = /[=+\-*/%&|^~]/g.test(query); // Has operators
    const hasCamelCase = /[a-z][A-Z]/.test(query); // Has camelCase
    const hasUnderscores = /_/.test(query); // Has snake_case
    const wordCount = query.split(/\s+/).length;

    // Code-heavy query: More weight on vector similarity
    if (hasCodePatterns || hasOperators || hasCamelCase || hasUnderscores) {
      vectorWeight = 0.8;
      keywordWeight = 0.2;
      logger.debug("Query type: CODE-HEAVY (adjusting weights)");
    }
    // Natural language query: More weight on keywords
    else if (wordCount > 3) {
      vectorWeight = 0.6;
      keywordWeight = 0.4;
      logger.debug("Query type: KEYWORD-HEAVY (adjusting weights)");
    }
    // Short query: Balanced
    else {
      vectorWeight = 0.7;
      keywordWeight = 0.3;
      logger.debug("Query type: BALANCED");
    }

    return { vectorWeight, keywordWeight };
  }

  /**
   * Calculate keyword matching score.
   */
  private calculateKeywordScore(
    queryKeywords: string[],
    chunkKeywords: string[],
  ): number {
    if (queryKeywords.length === 0) {
      return 0;
    }

    const matches = queryKeywords.filter((qk) =>
      chunkKeywords.some((ck) => ck.toLowerCase().includes(qk.toLowerCase())),
    );

    return matches.length / queryKeywords.length;
  }

  /**
   * Format search results based on result format.
   */
  private async formatResults(
    results: VectorSearchResult[],
    format: SearchResultFormat,
  ): Promise<SearchResult[]> {
    return results.map((result, index) => {
      const metadata = result.metadata;
      const content = metadata.content || "";

      return {
        id: result.id,
        content,
        filePath: metadata.filePath,
        language: metadata.language,
        lines: {
          start: metadata.startLine,
          end: metadata.endLine,
        },
        score: result.score,
        rank: index + 1,
        metadata,
        snippet: this.formatSnippet(content, format, metadata),
        context: this.formatContext(content, format),
      };
    });
  }

  /**
   * Format code snippet based on result format.
   */
  private formatSnippet(
    content: string,
    format: SearchResultFormat,
    _metadata: any,
  ): string {
    switch (format) {
      case SearchResultFormat.SNIPPET:
        // Return first 10 lines
        return content.split("\n").slice(0, 10).join("\n");

      case SearchResultFormat.CONTEXT:
        // Return full content (it's already a function/class)
        return content;

      case SearchResultFormat.FILE:
        // Would need to read full file - for now return content
        return content;

      case SearchResultFormat.HYBRID:
        // Smart formatting based on size
        const lines = content.split("\n");
        if (lines.length <= 20) {
          return content; // Small enough, return all
        }
        return lines.slice(0, 15).join("\n") + "\n... (truncated)";

      case SearchResultFormat.RANKED:
        // Return content with rank marker
        return content;

      default:
        return content;
    }
  }

  /**
   * Format context (surrounding code).
   */
  private formatContext(
    content: string,
    format: SearchResultFormat,
  ): string | undefined {
    if (format === SearchResultFormat.CONTEXT) {
      // For context format, return the content itself as context
      return content;
    }
    return undefined;
  }

  /**
   * Filter results by path pattern.
   */
  private filterByPathPattern(
    results: SearchResult[],
    pattern: string,
  ): SearchResult[] {
    const regex = new RegExp(pattern, "i");
    return results.filter((r) => regex.test(r.filePath));
  }

  /**
   * Get search statistics.
   */
  async getSearchStats(): Promise<{
    totalVectors: number;
    dimensions: number;
  }> {
    try {
      await this.vectorDBProvider.connect();

      const stats = await this.vectorDBProvider.getStats(
        this.config.vectordb.collectionName,
      );

      return {
        totalVectors: stats.count,
        dimensions: stats.dimensions,
      };
    } catch (error) {
      logger.error("Failed to get search stats", error);
      throw new SearchError(
        "Failed to get search statistics",
        error instanceof Error ? { cause: error } : { error },
      );
    }
  }
}
