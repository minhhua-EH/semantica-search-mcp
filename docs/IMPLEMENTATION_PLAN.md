# Phase 1 Implementation Plan

## Overview

This document outlines the detailed implementation plan for Phase 1 of the Semantica Search MCP project.

## Phase 1 Goals

- ✅ Support Milvus (local) as vector database
- ✅ Support Ollama with nomic-embed-text embedding model
- ✅ Index TypeScript and Ruby codebases
- ✅ Implement configurable indexing granularity and search strategies
- ✅ Provide MCP tools for Claude Code integration
- ✅ Extensible architecture for Phase 2+ additions

## Technology Stack

| Component   | Technology                | Version |
| ----------- | ------------------------- | ------- |
| Runtime     | Node.js                   | >= 18   |
| Language    | TypeScript                | >= 5.3  |
| MCP SDK     | @modelcontextprotocol/sdk | 0.6.0   |
| Vector DB   | Milvus                    | 2.4+    |
| Embeddings  | Ollama (nomic-embed-text) | Latest  |
| Code Parser | tree-sitter               | Latest  |
| Testing     | Jest                      | Latest  |

## Project Structure

```
semantica-search-mcp/
├── src/
│   ├── index.ts                      # MCP server entry point
│   │
│   ├── config/
│   │   ├── schema.ts                 # Config type definitions
│   │   ├── default.ts                # Default configuration
│   │   ├── loader.ts                 # Config loading & validation
│   │   └── validator.ts              # Config validation logic
│   │
│   ├── providers/
│   │   ├── embedding/
│   │   │   ├── base.ts               # EmbeddingProvider interface
│   │   │   ├── ollama.provider.ts    # Ollama implementation
│   │   │   └── factory.ts            # Provider factory
│   │   │
│   │   └── vectordb/
│   │       ├── base.ts               # VectorDBProvider interface
│   │       ├── milvus.provider.ts    # Milvus implementation
│   │       └── factory.ts            # Provider factory
│   │
│   ├── services/
│   │   ├── indexing.service.ts       # Orchestrates indexing workflow
│   │   ├── search.service.ts         # Handles search queries
│   │   ├── parser.service.ts         # Code parsing & chunking
│   │   ├── file.service.ts           # File system operations
│   │   └── merkle.service.ts         # Change detection
│   │
│   ├── parsers/
│   │   ├── base.ts                   # Parser interface
│   │   ├── typescript.parser.ts      # TypeScript parser
│   │   ├── ruby.parser.ts            # Ruby parser
│   │   └── factory.ts                # Parser factory
│   │
│   ├── chunkers/
│   │   ├── base.ts                   # Chunker interface
│   │   ├── ast-split-merge.ts        # AST-based split-merge
│   │   ├── ast-extract.ts            # AST extraction
│   │   ├── sliding-window.ts         # Fixed-size chunking
│   │   └── factory.ts                # Chunker factory
│   │
│   ├── models/
│   │   ├── code-chunk.ts             # CodeChunk & metadata
│   │   ├── search-result.ts          # SearchResult
│   │   ├── index-status.ts           # Indexing status
│   │   └── types.ts                  # Shared types
│   │
│   ├── mcp/
│   │   ├── tools.ts                  # MCP tool definitions
│   │   ├── resources.ts              # MCP resource definitions
│   │   ├── prompts.ts                # MCP prompt definitions
│   │   └── handlers.ts               # Request handlers
│   │
│   └── utils/
│       ├── logger.ts                 # Logging utility
│       ├── errors.ts                 # Custom error classes
│       ├── hash.ts                   # Hashing utilities
│       └── token-counter.ts          # Token counting
│
├── tests/
│   ├── unit/                         # Unit tests
│   ├── integration/                  # Integration tests
│   └── fixtures/                     # Test fixtures
│
├── docs/
│   ├── ARCHITECTURE.md               # Architecture design
│   ├── CONFIGURATION.md              # Configuration guide
│   ├── IMPLEMENTATION_PLAN.md        # This file
│   └── API.md                        # API documentation
│
├── scripts/
│   ├── setup-milvus.sh              # Milvus setup script
│   ├── setup-ollama.sh              # Ollama setup script
│   └── check-prerequisites.sh       # Prerequisites checker
│
├── docker-compose.yml               # Milvus Docker setup
├── package.json
├── tsconfig.json
└── README.md
```

## Implementation Phases

### Week 1: Foundation & Infrastructure

#### Day 1-2: Project Setup & Configuration System

- [x] Update package.json with dependencies
- [ ] Create TypeScript configuration
- [ ] Implement configuration schema (src/config/schema.ts)
- [ ] Implement configuration loader (src/config/loader.ts)
- [ ] Implement configuration validator (src/config/validator.ts)
- [ ] Write tests for configuration system
- [ ] Create docker-compose.yml for Milvus

#### Day 3-4: Provider Interfaces & Ollama

- [ ] Define EmbeddingProvider interface (src/providers/embedding/base.ts)
- [ ] Implement OllamaProvider (src/providers/embedding/ollama.provider.ts)
- [ ] Implement embedding factory
- [ ] Add health checks for Ollama
- [ ] Write unit tests for OllamaProvider
- [ ] Create setup script for Ollama

#### Day 5-7: Vector DB Provider & Milvus

- [ ] Define VectorDBProvider interface (src/providers/vectordb/base.ts)
- [ ] Implement MilvusProvider (src/providers/vectordb/milvus.provider.ts)
  - Collection management
  - Insert operations
  - Search operations
  - Health checks
- [ ] Implement vector DB factory
- [ ] Write integration tests with real Milvus
- [ ] Create setup script for Milvus

### Week 2: Code Parsing & Chunking

#### Day 8-9: Base Parser & TypeScript Support

- [ ] Define Parser interface (src/parsers/base.ts)
- [ ] Setup tree-sitter for TypeScript
- [ ] Implement TypeScriptParser (src/parsers/typescript.parser.ts)
  - Function extraction
  - Class extraction
  - Interface/type extraction
  - Import/dependency tracking
- [ ] Write tests with TypeScript fixtures

#### Day 10-11: Ruby Parser

- [ ] Setup tree-sitter for Ruby
- [ ] Implement RubyParser (src/parsers/ruby.parser.ts)
  - Method (def) extraction
  - Class extraction
  - Module extraction
  - Require/import tracking
- [ ] Write tests with Ruby fixtures

#### Day 12-14: Chunking Strategies

- [ ] Define Chunker interface (src/chunkers/base.ts)
- [ ] Implement AST split-merge chunker
  - Recursive AST traversal
  - Token counting
  - Sibling merging logic
- [ ] Implement AST extract chunker
- [ ] Implement sliding-window chunker
- [ ] Implement chunker factory
- [ ] Write comprehensive chunking tests

### Week 3: Core Services

#### Day 15-16: File Service

- [ ] Implement FileService (src/services/file.service.ts)
  - Directory traversal
  - File filtering (include/exclude patterns)
  - Language detection
  - .gitignore parsing
- [ ] Write tests for file discovery

#### Day 17-18: Merkle Tree Service

- [ ] Implement MerkleService (src/services/merkle.service.ts)
  - File hashing
  - Merkle tree building
  - Change detection
  - Persistence
- [ ] Write tests for change detection

#### Day 19-20: Indexing Service

- [ ] Implement IndexingService (src/services/indexing.service.ts)
  - Orchestrate: discover → parse → chunk → embed → store
  - Batch processing
  - Progress tracking
  - Error handling & retry
- [ ] Write integration tests

#### Day 21: Search Service

- [ ] Implement SearchService (src/services/search.service.ts)
  - Query embedding
  - Vector search
  - Keyword extraction (for hybrid)
  - Result formatting
  - Ranking & scoring
- [ ] Write integration tests

### Week 4: MCP Integration & Polish

#### Day 22-23: MCP Tools

- [ ] Define tool schemas (src/mcp/tools.ts)
  - `index_codebase`: Index a codebase
  - `search_code`: Semantic search
  - `reindex`: Trigger re-indexing
  - `get_status`: Get indexing status
  - `configure`: Update configuration
- [ ] Implement tool handlers (src/mcp/handlers.ts)
- [ ] Write end-to-end tests

#### Day 24-25: MCP Resources

- [ ] Define resource schemas (src/mcp/resources.ts)
  - `codebase://status`: Indexing status
  - `codebase://config`: Current configuration
  - `codebase://chunks`: All chunks
  - `search-results://`: Search results
- [ ] Implement resource handlers

#### Day 26: MCP Prompts

- [ ] Define prompt schemas (src/mcp/prompts.ts)
  - `explain_code`: Explain code with context
  - `find_similar`: Find similar code patterns
- [ ] Implement prompt handlers

#### Day 27-28: Testing & Documentation

- [ ] Write comprehensive integration tests
- [ ] Test with real codebases (TypeScript & Ruby)
- [ ] Measure performance (indexing speed, search latency)
- [ ] Update README.md with:
  - Installation instructions
  - Quick start guide
  - Configuration examples
  - MCP integration setup
- [ ] Create API documentation (docs/API.md)
- [ ] Record demo video

## Dependencies

### Core Dependencies

```json
{
  "dependencies": {
    "@modelcontextprotocol/sdk": "0.6.0",
    "@milvus/milvus2-sdk-node": "^2.4.0",
    "tree-sitter": "^0.21.0",
    "tree-sitter-typescript": "^0.21.0",
    "tree-sitter-ruby": "^0.21.0",
    "zod": "^3.22.0",
    "axios": "^1.6.0",
    "glob": "^10.3.0",
    "ignore": "^5.3.0",
    "fast-glob": "^3.3.0"
  },
  "devDependencies": {
    "@types/node": "^20.11.0",
    "typescript": "^5.3.0",
    "@types/jest": "^29.5.0",
    "jest": "^29.7.0",
    "ts-jest": "^29.1.0",
    "ts-node": "^10.9.0"
  }
}
```

## Testing Strategy

### Unit Tests

- Configuration validation
- Provider interfaces
- Parsers (with fixtures)
- Chunkers (with fixtures)
- Utilities

### Integration Tests

- Ollama integration (requires running Ollama)
- Milvus integration (requires running Milvus)
- End-to-end indexing workflow
- End-to-end search workflow

### Test Coverage Target

- Minimum: 80% code coverage
- Critical paths: 95% coverage

## Performance Benchmarks

Test with sample codebases:

| Metric         | Small (100 files) | Medium (1k files) | Large (10k files) |
| -------------- | ----------------- | ----------------- | ----------------- |
| Index time     | < 30 sec          | < 5 min           | < 10 min          |
| Memory usage   | < 200 MB          | < 500 MB          | < 2 GB            |
| Search latency | < 500 ms          | < 1 sec           | < 2 sec           |

## Docker Compose Setup

```yaml
version: "3.8"

services:
  milvus-etcd:
    image: quay.io/coreos/etcd:latest
    environment:
      - ETCD_AUTO_COMPACTION_MODE=revision
      - ETCD_AUTO_COMPACTION_RETENTION=1000
      - ETCD_QUOTA_BACKEND_BYTES=4294967296
    volumes:
      - milvus-etcd:/etcd

  milvus-minio:
    image: minio/minio:latest
    environment:
      MINIO_ACCESS_KEY: minioadmin
      MINIO_SECRET_KEY: minioadmin
    volumes:
      - milvus-minio:/minio_data
    command: minio server /minio_data

  milvus-standalone:
    image: milvusdb/milvus:latest
    command: ["milvus", "run", "standalone"]
    environment:
      ETCD_ENDPOINTS: milvus-etcd:2379
      MINIO_ADDRESS: milvus-minio:9000
    volumes:
      - milvus-standalone:/var/lib/milvus
    ports:
      - "19530:19530"
      - "9091:9091"
    depends_on:
      - milvus-etcd
      - milvus-minio

volumes:
  milvus-etcd:
  milvus-minio:
  milvus-standalone:
```

## Risk Mitigation

| Risk                       | Impact | Mitigation                                   |
| -------------------------- | ------ | -------------------------------------------- |
| Ollama not installed       | High   | Check + install script, clear error messages |
| Milvus connection fails    | High   | Docker compose provided, health checks       |
| Large file handling        | Medium | File size limits, streaming processing       |
| OOM on large codebases     | Medium | Batch processing, configurable limits        |
| Tree-sitter parsing errors | Medium | Fallback to sliding-window chunking          |

## Success Criteria

Phase 1 is complete when:

- ✅ Can index a TypeScript codebase (1k+ files) successfully
- ✅ Can index a Ruby codebase (1k+ files) successfully
- ✅ Semantic search returns relevant results (>80% accuracy)
- ✅ Incremental re-indexing works (Merkle tree)
- ✅ All MCP tools work in Claude Code
- ✅ Documentation is complete
- ✅ Test coverage > 80%
- ✅ Performance meets benchmarks

## Next: Phase 2 Preview

After Phase 1 completion:

- Add Qdrant support
- Add OpenAI embedding support
- Add more languages (Python, Go, Java)
- Improve search with BM25 (true hybrid search)
- Add monitoring and metrics

## Questions & Decisions Log

| Date       | Question                     | Decision                     | Rationale                        |
| ---------- | ---------------------------- | ---------------------------- | -------------------------------- |
| 2026-02-07 | Which tree-sitter bindings?  | Official tree-sitter package | Best maintained, most stable     |
| 2026-02-07 | Sync vs async file scanning? | Async with concurrency limit | Better performance, controllable |
| 2026-02-07 | Where to store Merkle trees? | .semantica/merkle/           | Hidden, gitignored, isolated     |
