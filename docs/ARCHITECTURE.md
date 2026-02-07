# Architecture Design - Semantica Search MCP

## Overview

This document outlines the architecture for a semantic code search MCP server based on research from GitHub Copilot, Sourcegraph Cody, and claude-context implementations.

## Research Sources

### Indexing Strategies

- [GitHub Copilot Instant Semantic Indexing](https://github.blog/changelog/2025-03-12-instant-semantic-code-search-indexing-now-generally-available-for-github-copilot/)
- [GitHub Copilot Indexing Discussion](https://github.com/orgs/community/discussions/153841)
- [Sourcegraph Code Search at Scale](https://sourcegraph.com/blog/why-code-search-at-scale-is-essential-when-you-grow-beyond-one-repository)

### Chunking Strategies

- [AST-Aware Code Chunking](https://supermemory.ai/blog/building-code-chunk-ast-aware-code-chunking/)
- [cAST Research Paper](https://arxiv.org/html/2506.15655v1)
- [Building RAG on Codebases](https://lancedb.com/blog/building-rag-on-codebases-part-1/)
- [How Cursor Indexes Codebases](https://read.engineerscodex.com/p/how-cursor-indexes-codebases-fast)

### Reference Implementation

- [Claude Context MCP Server](https://github.com/zilliztech/claude-context)
- [Claude Code MCP Integration](https://code.claude.com/docs/en/mcp)

## Core Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    MCP Server Layer                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │   Tools      │  │  Resources   │  │   Prompts    │     │
│  │              │  │              │  │              │     │
│  │ • index      │  │ • chunks     │  │ • search     │     │
│  │ • search     │  │ • status     │  │ • explain    │     │
│  │ • configure  │  │ • config     │  │              │     │
│  └──────────────┘  └──────────────┘  └──────────────┘     │
└─────────────┬───────────────────────────────────────────────┘
              │
┌─────────────▼───────────────────────────────────────────────┐
│                   Service Layer                             │
│  ┌──────────────────┐    ┌──────────────────────┐         │
│  │ IndexingService  │    │   SearchService      │         │
│  │                  │    │                      │         │
│  │ • File scanning  │    │ • Query embedding    │         │
│  │ • Change detect  │    │ • Vector search      │         │
│  │ • Orchestration  │    │ • Result formatting  │         │
│  └──────────────────┘    │ • Ranking            │         │
│           │               └──────────────────────┘         │
│           ▼                          ▲                      │
│  ┌──────────────────┐                │                      │
│  │  ParserService   │                │                      │
│  │                  │                │                      │
│  │ • Language detect│                │                      │
│  │ • AST parsing    │                │                      │
│  │ • Chunking       │                │                      │
│  └──────────────────┘                │                      │
└─────────────┬───────────────────────┬────────────────────────┘
              │                       │
┌─────────────▼─────────┐  ┌──────────▼──────────────────────┐
│  Embedding Provider   │  │  Vector DB Provider             │
│  (Plugin Interface)   │  │  (Plugin Interface)             │
├───────────────────────┤  ├─────────────────────────────────┤
│ • OllamaProvider      │  │ • MilvusProvider                │
│   - nomic-embed-text  │  │   - Local                       │
│   - nomic-embed-large │  │   - Cloud                       │
│                       │  │                                 │
│ • OpenAIProvider      │  │ • QdrantProvider                │
│   - text-embedding-3  │  │   - Local                       │
│   - ada-002           │  │   - Cloud                       │
└───────────────────────┘  └─────────────────────────────────┘
```

## Configuration System

### User-Configurable Options

#### 1. Indexing Granularity

Based on research, we support multiple granularity levels:

| Strategy     | Description                  | Token Size   | Use Case                   |
| ------------ | ---------------------------- | ------------ | -------------------------- |
| **file**     | Whole file as single chunk   | Variable     | Small files, config files  |
| **function** | Individual functions/methods | ~100-500     | Most common, recommended   |
| **class**    | Complete classes/modules     | ~200-1000    | OOP codebases              |
| **block**    | Semantic code blocks         | ~50-250      | Fine-grained search        |
| **hybrid**   | Smart mix based on size      | ~250 (avg)   | **Default** - Best balance |
| **fixed**    | Fixed-size with overlap      | Configurable | Legacy support             |

**Default: hybrid** (GitHub Copilot's 250-token approach)

#### 2. Chunking Strategy

Based on [AST-aware chunking research](https://supermemory.ai/blog/building-code-chunk-ast-aware-code-chunking/):

- **ast-split-merge**: Recursive split-then-merge algorithm (default)
  - Preserves syntactic boundaries
  - Merges small siblings to avoid fragmentation
  - Best for code understanding

- **ast-extract**: Extract specific node types (functions, classes)
  - Simple and fast
  - Good for well-structured code

- **sliding-window**: Fixed-size chunks with overlap
  - Language-agnostic fallback
  - Good for non-code files

#### 3. Search Result Format

| Format      | Description                       | Returns             |
| ----------- | --------------------------------- | ------------------- |
| **snippet** | Code snippet + line numbers       | 3-10 lines          |
| **context** | Snippet + surrounding context     | Full function/class |
| **file**    | Whole file with highlighted match | Entire file         |
| **hybrid**  | Smart format based on match size  | **Default**         |
| **ranked**  | Multiple results with scores      | Top N matches       |

#### 4. Re-indexing Strategy

Inspired by [claude-context's Merkle tree approach](https://github.com/zilliztech/claude-context):

- **manual**: User triggers re-index
- **watch**: Watch file changes, auto re-index
- **incremental**: Track changes with Merkle trees (default)
- **scheduled**: Periodic re-indexing (cron-like)

#### 5. Search Strategy

Based on [Sourcegraph's hybrid approach](https://sourcegraph.com/blog/why-code-search-at-scale-is-essential-when-you-grow-beyond-one-repository):

- **semantic**: Pure vector similarity search
- **keyword**: BM25 text search
- **hybrid**: Combine semantic + keyword (default, 40% more efficient)
- **graph**: Include dependency information

## Provider Architecture

### Embedding Provider Interface

```typescript
interface EmbeddingProvider {
  name: string;
  modelName: string;
  dimensions: number;
  maxTokens: number;

  // Core methods
  embed(text: string): Promise<number[]>;
  embedBatch(texts: string[]): Promise<number[][]>;

  // Health & validation
  healthCheck(): Promise<boolean>;
  estimateCost(tokenCount: number): number;
}
```

**Phase 1 Implementations:**

- `OllamaProvider` (nomic-embed-text: 768d, nomic-embed-large: 1024d)

**Phase 2 Implementations:**

- `OpenAIProvider` (text-embedding-3-small: 1536d, text-embedding-3-large: 3072d)

### Vector DB Provider Interface

```typescript
interface VectorDBProvider {
  name: string;
  isConnected: boolean;

  // Collection management
  createCollection(name: string, dimensions: number): Promise<void>;
  deleteCollection(name: string): Promise<void>;
  collectionExists(name: string): Promise<boolean>;

  // CRUD operations
  insert(collection: string, vectors: Vector[]): Promise<void>;
  search(
    collection: string,
    query: number[],
    limit: number,
  ): Promise<SearchResult[]>;
  delete(collection: string, ids: string[]): Promise<void>;

  // Maintenance
  healthCheck(): Promise<boolean>;
  getStats(collection: string): Promise<CollectionStats>;
}
```

**Phase 1 Implementations:**

- `MilvusProvider` (local + cloud support)

**Phase 2 Implementations:**

- `QdrantProvider` (local + cloud support)

## Data Models

### CodeChunk

```typescript
interface CodeChunk {
  id: string; // UUID
  content: string; // Actual code
  embedding?: number[]; // Vector embedding
  metadata: ChunkMetadata; // Rich metadata
}

interface ChunkMetadata {
  // File info
  filePath: string; // Relative path from project root
  absolutePath: string; // Full system path
  language: string; // typescript, ruby, etc.

  // Location info
  startLine: number;
  endLine: number;
  startChar: number;
  endChar: number;

  // Chunk info
  chunkType: ChunkType; // function, class, file, block
  granularity: string; // Strategy used
  parentChunkId?: string; // For hierarchical chunks

  // Code semantics
  symbolName?: string; // function/class name
  symbolType?: string; // function, class, method, etc.
  scope?: string; // public, private, etc.

  // Version control
  gitHash?: string; // Current commit
  lastModified: Date;

  // Search optimization
  keywords: string[]; // Extracted keywords for hybrid search
  dependencies?: string[]; // Imports/requires
}
```

### SearchResult

```typescript
interface SearchResult {
  chunk: CodeChunk;
  score: number; // Similarity score (0-1)
  rank: number; // Result ranking
  format: ResultFormat; // How to display
  highlights?: Highlight[]; // Match highlights
  context?: CodeChunk[]; // Surrounding chunks
}
```

## Performance Targets

Based on research benchmarks:

| Metric                    | Target   | Rationale                  |
| ------------------------- | -------- | -------------------------- |
| Initial index (10k files) | < 10 min | Claude-context benchmark   |
| Incremental update        | < 5 sec  | Real-time feel             |
| Query latency             | < 2 sec  | GitHub Copilot standard    |
| Token reduction           | 40%      | Claude-context achievement |
| Memory usage              | < 2GB    | Reasonable for local       |

## Language Support Priority

**Phase 1:**

1. TypeScript (.ts, .tsx)
2. Ruby (.rb)

**Phase 2:** 3. JavaScript (.js, .jsx) 4. Python (.py) 5. Go (.go) 6. Java (.java)

## Change Detection Strategy

Following [claude-context's Merkle tree approach](https://github.com/zilliztech/claude-context):

1. **Initial Index**: Build Merkle tree of file hashes
2. **Change Detection**: Compare current vs stored tree
3. **Incremental Update**: Re-index only changed files
4. **Efficiency**: O(log n) change detection

```
.semantica/
├── merkle/
│   └── <project-hash>.json    # Merkle tree snapshot
├── cache/
│   └── embeddings/            # Cached embeddings
└── config/
    └── index.json             # Index metadata
```

## Security & Privacy

- All processing can be done locally (Ollama + Milvus)
- No code sent to external APIs (unless user chooses OpenAI)
- Vector DB can be self-hosted
- Git-ignored files are automatically excluded
- Respects .gitignore and custom ignore patterns

## Next Steps

1. Implement provider interfaces
2. Build configuration system
3. Implement AST-based chunking with tree-sitter
4. Integrate Milvus + Ollama
5. Create MCP tool definitions
6. Build testing framework
