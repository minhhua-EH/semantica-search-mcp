# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Semantica Search MCP is a TypeScript-based MCP (Model Context Protocol) server for semantic code search. It enables AI assistants to index and search codebases using vector embeddings, AST-based parsing, and intelligent chunking strategies.

**Phase 1 Focus**: TypeScript + Ruby support with Milvus (Vector DB) and Ollama (Embeddings)

## Development Commands

### Build

```bash
npm run build
```

Compiles TypeScript to JavaScript in `./build` directory and makes the output executable.

### Development with Auto-Rebuild

```bash
npm run watch
```

Runs TypeScript compiler in watch mode for continuous rebuilding.

### Testing

```bash
npm test                  # Run all tests
npm run test:watch        # Run tests in watch mode
npm run test:coverage     # Generate coverage report (target: 80%)
```

### Debugging with MCP Inspector

```bash
npm run inspector
```

Launches the MCP Inspector for debugging stdio-based MCP communication.

## Project Structure

```
src/
├── config/               # Configuration system (Zod schemas, loaders, validators)
├── providers/
│   ├── embedding/        # Embedding provider interfaces (Ollama, OpenAI)
│   └── vectordb/         # Vector DB provider interfaces (Milvus, Qdrant)
├── services/
│   ├── indexing.service  # Orchestrates: discover → parse → chunk → embed → store
│   ├── search.service    # Semantic search with hybrid strategies
│   ├── parser.service    # Code parsing and language detection
│   ├── file.service      # File discovery and filtering
│   └── merkle.service    # Change detection with Merkle trees
├── parsers/              # Language-specific AST parsers (tree-sitter)
├── chunkers/             # Chunking strategies (AST split-merge, extract, sliding-window)
├── models/               # Data models (CodeChunk, SearchResult, etc.)
├── mcp/                  # MCP tool/resource/prompt definitions
└── utils/                # Utilities (logger, errors, hash, token-counter)

tests/
├── unit/                 # Unit tests for individual components
├── integration/          # Integration tests (Ollama, Milvus)
└── fixtures/             # Test fixtures (sample code files)

docs/
├── ARCHITECTURE.md       # System design and architecture
├── CONFIGURATION.md      # Configuration guide
└── IMPLEMENTATION_PLAN.md # 4-week implementation roadmap
```

## Technology Stack

| Component             | Technology                | Purpose                              |
| --------------------- | ------------------------- | ------------------------------------ |
| **Vector DB**         | Milvus 2.4+               | Vector storage and similarity search |
| **Embeddings**        | Ollama (nomic-embed-text) | Local embedding generation (768d)    |
| **AST Parser**        | tree-sitter               | Multi-language code parsing          |
| **Config Validation** | Zod                       | Runtime type validation              |
| **File Scanning**     | fast-glob, ignore         | Efficient file discovery             |
| **Testing**           | Jest, ts-jest             | Unit and integration testing         |

## TypeScript Configuration

- **Target**: ES2022
- **Module System**: Node16 with ES modules (`"type": "module"`)
- **Strict Mode**: Enabled (strict type checking)
- **Path Aliases**: `@/*` maps to `src/*` for cleaner imports
- **Source Maps**: Enabled for debugging
- **Declaration Files**: Generated for type definitions

Example import using path alias:

```typescript
import { ConfigLoader } from "@/config/loader";
import { MilvusProvider } from "@/providers/vectordb/milvus.provider";
```

## Architecture Patterns

### Provider Pattern

All external integrations use provider interfaces for easy swapping:

```typescript
interface EmbeddingProvider {
  embed(text: string): Promise<number[]>;
  healthCheck(): Promise<boolean>;
}

// Phase 1: OllamaProvider
// Phase 2: OpenAIProvider
```

### Configuration System

- User-configurable indexing granularity (file, function, class, hybrid, etc.)
- Pluggable chunking strategies (AST split-merge, extract, sliding-window)
- Flexible search strategies (semantic, keyword, hybrid)
- Multiple re-indexing modes (manual, watch, incremental with Merkle trees)

### Change Detection

Uses Merkle trees (stored in `.semantica/merkle/`) to track file changes and enable incremental re-indexing.

## Key Design Decisions

1. **AST-Based Chunking**: Uses tree-sitter for language-aware code chunking (preserves syntactic boundaries)
2. **Hybrid Search**: Combines vector similarity + keyword search (40% more efficient than vector-only)
3. **Local-First**: Ollama + Milvus can run entirely locally (no external API calls)
4. **Extensible**: Provider pattern allows easy addition of new vector DBs and embedding models

## Prerequisites

### Milvus (Vector Database)

```bash
# Check if running
curl http://localhost:19530/healthz

# If not running, see docs/IMPLEMENTATION_PLAN.md for Docker setup
```

### Ollama (Embedding Model)

```bash
# Check if installed
ollama list

# Should show: nomic-embed-text
# If not installed: ollama pull nomic-embed-text
```

## Installation for Claude Desktop

Add to Claude Desktop config:

- MacOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "semantica-search-mcp": {
      "command": "/path/to/semantica-search-mcp/build/index.js"
    }
  }
}
```

## Development Workflow

1. **Make changes** to source files in `src/`
2. **Write tests** in `tests/unit/` or `tests/integration/`
3. **Run tests**: `npm test`
4. **Check coverage**: `npm run test:coverage` (target: 80%)
5. **Build**: `npm run build`
6. **Commit frequently** with clear, concise messages

## Testing Strategy

- **Unit Tests**: Test individual components in isolation
- **Integration Tests**: Test with real Milvus + Ollama (require services running)
- **Coverage Target**: 80% minimum (configured in jest.config.js)
- **Fixtures**: Use real TypeScript/Ruby code samples in `tests/fixtures/`

## Performance Targets

| Metric          | Target       |
| --------------- | ------------ |
| Index 1k files  | < 5 minutes  |
| Index 10k files | < 10 minutes |
| Search latency  | < 2 seconds  |
| Memory usage    | < 2 GB       |

## Important Files

- `docs/ARCHITECTURE.md` - Detailed architecture and design decisions
- `docs/CONFIGURATION.md` - Configuration options and examples
- `docs/IMPLEMENTATION_PLAN.md` - 4-week implementation roadmap
- `jest.config.js` - Jest testing configuration
- `tsconfig.json` - TypeScript compiler configuration

## Phase 1 Implementation Status

See `docs/IMPLEMENTATION_PLAN.md` for detailed week-by-week breakdown.

Current focus: Configuration system and provider interfaces.
