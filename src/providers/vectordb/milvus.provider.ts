/**
 * Milvus vector database provider implementation.
 */

import { MilvusClient, DataType } from "@zilliz/milvus2-sdk-node";
import type { MilvusConfig } from "../../config/schema.js";
import type {
  Vector,
  SearchResult,
  CollectionStats,
  SearchOptions,
  InsertOptions,
} from "../../models/vector.js";
import {
  VectorDBProvider,
  CollectionNotFoundError,
  CollectionExistsError,
  ConnectionError,
} from "./base.js";

/**
 * Milvus vector database provider.
 */
export class MilvusProvider implements VectorDBProvider {
  readonly name = "milvus";
  isConnected = false;

  private client: MilvusClient;
  private config: MilvusConfig;

  constructor(config: MilvusConfig) {
    this.config = config;

    // Create Milvus client
    this.client = new MilvusClient({
      address: `${config.host}:${config.port}`,
      username: config.username || undefined,
      password: config.password || undefined,
      ssl: config.secure,
    });
  }

  /**
   * Connect to Milvus.
   */
  async connect(): Promise<void> {
    try {
      // Test connection by checking server health
      const health = await this.healthCheck();
      if (!health) {
        throw new Error("Milvus health check failed");
      }
      this.isConnected = true;
    } catch (error) {
      throw new ConnectionError(
        "milvus",
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Close connection to Milvus.
   */
  async close(): Promise<void> {
    this.isConnected = false;
    // Milvus SDK doesn't have explicit close method
  }

  /**
   * Create a new collection.
   */
  async createCollection(name: string, dimensions: number): Promise<void> {
    try {
      // Check if collection already exists
      const exists = await this.collectionExists(name);
      if (exists) {
        throw new CollectionExistsError("milvus", name);
      }

      // Create collection with schema
      await this.client.createCollection({
        collection_name: name,
        fields: [
          {
            name: "id",
            data_type: DataType.VarChar,
            is_primary_key: true,
            max_length: 255,
          },
          {
            name: "vector",
            data_type: DataType.FloatVector,
            dim: dimensions,
          },
          {
            name: "metadata",
            data_type: DataType.JSON,
          },
        ],
      });

      // Create index on vector field
      await this.client.createIndex({
        collection_name: name,
        field_name: "vector",
        index_type: this.config.indexType,
        metric_type: this.config.metricType,
        params: { nlist: 1024 }, // Default IVF_FLAT params
      });

      // Load collection into memory
      await this.client.loadCollection({
        collection_name: name,
      });
    } catch (error: any) {
      if (error instanceof CollectionExistsError) {
        throw error;
      }
      throw new ConnectionError(
        "milvus",
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Delete a collection.
   */
  async deleteCollection(name: string): Promise<void> {
    try {
      const exists = await this.collectionExists(name);
      if (!exists) {
        throw new CollectionNotFoundError("milvus", name);
      }

      await this.client.dropCollection({
        collection_name: name,
      });
    } catch (error: any) {
      if (error instanceof CollectionNotFoundError) {
        throw error;
      }
      throw new ConnectionError(
        "milvus",
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Check if collection exists.
   */
  async collectionExists(name: string): Promise<boolean> {
    try {
      const result = await this.client.hasCollection({
        collection_name: name,
      });
      return Boolean(result.value);
    } catch (error) {
      return false;
    }
  }

  /**
   * Insert vectors into collection.
   */
  async insert(
    collection: string,
    vectors: Vector[],
    _options?: InsertOptions,
  ): Promise<void> {
    try {
      // Check collection exists
      const exists = await this.collectionExists(collection);
      if (!exists) {
        throw new CollectionNotFoundError("milvus", collection);
      }

      // Prepare data for insertion
      const data = vectors.map((v) => ({
        id: v.id,
        vector: v.vector,
        metadata: v.metadata,
      }));

      // Insert data
      await this.client.insert({
        collection_name: collection,
        data,
      });

      // Flush to ensure data is persisted
      await this.client.flush({
        collection_names: [collection],
      });
    } catch (error: any) {
      if (error instanceof CollectionNotFoundError) {
        throw error;
      }
      throw new ConnectionError(
        "milvus",
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Search for similar vectors.
   */
  async search(
    collection: string,
    query: number[],
    options?: SearchOptions,
  ): Promise<SearchResult[]> {
    try {
      // Check collection exists
      const exists = await this.collectionExists(collection);
      if (!exists) {
        throw new CollectionNotFoundError("milvus", collection);
      }

      // Ensure collection is loaded for search
      await this.client.loadCollection({
        collection_name: collection,
      });

      const limit = options?.limit || 10;
      const minScore = options?.minScore || 0;

      // Build filter expression from metadata filters
      let filter = "";
      if (options?.filters) {
        const conditions: string[] = [];
        for (const [key, value] of Object.entries(options.filters)) {
          if (typeof value === "string") {
            conditions.push(`metadata["${key}"] == "${value}"`);
          } else if (typeof value === "number") {
            conditions.push(`metadata["${key}"] == ${value}`);
          } else if (typeof value === "boolean") {
            conditions.push(`metadata["${key}"] == ${value}`);
          }
        }
        filter = conditions.join(" and ");
      }

      // Perform search
      const searchResult = await this.client.search({
        collection_name: collection,
        data: [query],
        filter: filter || undefined,
        limit,
        output_fields: ["id", "metadata"],
        params: { nprobe: 10 }, // IVF_FLAT search params
      });

      // Transform results
      const results: SearchResult[] = [];
      for (const hit of searchResult.results) {
        // Filter by minimum score
        if (hit.score < minScore) {
          continue;
        }

        results.push({
          id: hit.id as string,
          score: hit.score,
          metadata: hit.metadata as Record<string, any>,
        });
      }

      return results;
    } catch (error: any) {
      if (error instanceof CollectionNotFoundError) {
        throw error;
      }
      throw new ConnectionError(
        "milvus",
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Delete vectors by IDs.
   */
  async delete(collection: string, ids: string[]): Promise<void> {
    try {
      // Check collection exists
      const exists = await this.collectionExists(collection);
      if (!exists) {
        throw new CollectionNotFoundError("milvus", collection);
      }

      // Delete by IDs
      await this.client.delete({
        collection_name: collection,
        filter: `id in [${ids.map((id) => `"${id}"`).join(",")}]`,
      });
    } catch (error: any) {
      if (error instanceof CollectionNotFoundError) {
        throw error;
      }
      throw new ConnectionError(
        "milvus",
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Get collection statistics.
   */
  async getStats(collection: string): Promise<CollectionStats> {
    try {
      // Check collection exists
      const exists = await this.collectionExists(collection);
      if (!exists) {
        throw new CollectionNotFoundError("milvus", collection);
      }

      // Get collection info
      const info = await this.client.describeCollection({
        collection_name: collection,
      });

      // Get row count
      const stats = await this.client.getCollectionStatistics({
        collection_name: collection,
      });

      // Find vector field
      const vectorField = info.schema.fields.find(
        (f: any) => f.data_type === DataType.FloatVector,
      );

      // Parse row count
      const rowCount =
        typeof stats.data.row_count === "number"
          ? stats.data.row_count
          : parseInt(String(stats.data.row_count)) || 0;

      // Get dimensions from vector field
      // Dimensions are in type_params array as {"key": "dim", "value": "768"}
      const vectorFieldAny = vectorField as any;
      let dimensions = 0;

      if (vectorFieldAny?.type_params) {
        const dimParam = vectorFieldAny.type_params.find(
          (p: any) => p.key === "dim",
        );
        if (dimParam?.value) {
          dimensions =
            typeof dimParam.value === "number"
              ? dimParam.value
              : parseInt(String(dimParam.value)) || 0;
        }
      }

      return {
        count: rowCount,
        dimensions,
        indexed: true, // We always create index
        indexType: this.config.indexType,
        metricType: this.config.metricType,
      };
    } catch (error: any) {
      if (error instanceof CollectionNotFoundError) {
        throw error;
      }
      throw new ConnectionError(
        "milvus",
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Health check for Milvus.
   */
  async healthCheck(): Promise<boolean> {
    try {
      // Try to check server version
      const version = await this.client.checkHealth();
      return version.isHealthy;
    } catch (error) {
      return false;
    }
  }
}

/**
 * Create Milvus provider with configuration.
 */
export function createMilvusProvider(config: MilvusConfig): MilvusProvider {
  return new MilvusProvider(config);
}
