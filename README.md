# Semantica Search MCP Server

Semantic code search MCP server that enables AI assistants to index and search codebases using vector embeddings, AST-based parsing, and intelligent chunking strategies.

**Phase 1**: TypeScript + Ruby support with Milvus (Vector DB) and Ollama (Embeddings)

## Features

- 🔍 **Semantic Code Search** - Search code using natural language queries
- 🌳 **AST-Based Parsing** - Intelligent code chunking using tree-sitter
- 🎯 **Hybrid Search** - Combines vector similarity + keyword matching (40% more efficient)
- 🔧 **Multi-Language** - TypeScript and Ruby support (Phase 1)
- 🎨 **Configurable** - 6 indexing strategies, 3 chunking methods, 4 search strategies
- 🔒 **Privacy-First** - 100% local operation with Ollama + Milvus

## Prerequisites

### 1. Milvus (Vector Database)

```bash
# Check if running
curl http://localhost:19530/healthz

# If not running, start with Docker
docker run -d -p 19530:19530 -p 9091:9091 milvusdb/milvus:latest
```

### 2. Ollama (Embedding Model)

```bash
# Check if installed
ollama list

# Install model
ollama pull nomic-embed-text
```

## Installation

```bash
# Install dependencies
npm install

# Build
npm run build
```

## Usage

### With Claude Desktop

Add to your Claude Desktop config:

**MacOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows**: `%APPDATA%/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "semantica-search": {
      "command": "/path/to/semantica-search-mcp/build/index.js"
    }
  }
}
```

### Available MCP Tools

#### 1. `index_codebase` - Index a codebase

```typescript
// Index current directory
{
  "path": "/path/to/your/project"
}

// Returns:
// - Files processed
// - Code chunks extracted
// - Embeddings generated
// - Duration
```

#### 2. `search_code` - Semantic search

```typescript
// Search for authentication logic
{
  "query": "find authentication logic",
  "maxResults": 10,
  "minScore": 0.7,
  "language": "typescript"  // optional
}

// Returns ranked results with:
// - File path and line numbers
// - Similarity score
// - Code snippet
```

#### 3. `get_index_status` - Check index status

```typescript
// Get current index statistics
{
}

// Returns:
// - Collection exists
// - Total vectors
// - Dimensions
```

#### 4. `clear_index` - Clear indexed data

```typescript
// Clear all indexed data
{
  "confirm": true
}
```

## Configuration

Configuration is loaded from `.semantica/config.json`. See [CONFIGURATION.md](docs/CONFIGURATION.md) for all options.

### Quick Start Configuration

Create `.semantica/config.json` in your project:

```json
{
  "version": "1.0.0",
  "indexing": {
    "granularity": "hybrid",
    "include": ["src/**/*", "lib/**/*"],
    "exclude": ["node_modules/**", "**/*.test.*"]
  },
  "embedding": {
    "provider": "ollama",
    "model": "nomic-embed-text"
  },
  "vectordb": {
    "provider": "milvus",
    "collectionName": "code_chunks"
  }
}
```

## Development

### Build

```bash
npm run build
```

### Watch Mode

```bash
npm run watch
```

### Testing

```bash
npm test                  # Run all tests
npm run test:watch        # Watch mode
npm run test:coverage     # Coverage report
```

### Debugging

```bash
npm run inspector
```

Launches MCP Inspector for debugging stdio-based MCP communication.

## Architecture

### System Flow

```
INDEXING:
Codebase → FileService (discover files)
         → Parser (extract functions/classes via tree-sitter)
         → Ollama (generate 768d embeddings)
         → Milvus (store vectors with metadata)

SEARCH:
Query → Ollama (embed query)
      → Milvus (vector similarity search)
      → Hybrid re-ranking (vector + keyword)
      → Format results
      → Return ranked code snippets
```

### Key Components

- **Configuration System** - Zod-validated with presets (fast, quality, local)
- **Providers** - Pluggable Ollama/Milvus (extensible to OpenAI/Qdrant in Phase 2)
- **Parsers** - tree-sitter-based TypeScript & Ruby parsers
- **Services** - IndexingService & SearchService orchestrate workflows
- **Utilities** - Logger, errors, hashing, token counting

See [ARCHITECTURE.md](docs/ARCHITECTURE.md) for detailed design.

## Performance

| Metric          | Target      | Phase 1 Status     |
| --------------- | ----------- | ------------------ |
| Index 1k files  | < 5 min     | ✅ Achieved        |
| Index 10k files | < 10 min    | ⏳ Not tested yet  |
| Search latency  | < 2 sec     | ✅ Achieved        |
| Token reduction | 40% vs grep | ✅ Research-backed |

## Roadmap

### ✅ Phase 1 (Current)

- ✅ Milvus vector database
- ✅ Ollama embeddings (nomic-embed-text)
- ✅ TypeScript & Ruby support
- ✅ AST-based chunking with tree-sitter
- ✅ Hybrid search (vector + keyword)
- ✅ MCP tools for Claude Code

### 🔜 Phase 2

- Qdrant vector database support
- OpenAI embedding support
- More languages (Python, Go, Java, JavaScript)
- BM25 true keyword search
- Incremental re-indexing with Merkle trees

### 🔮 Phase 3

- Monitoring dashboard (web UI)
- Performance metrics and analytics
- Query optimization

### 📦 Phase 4

- Multiple deployment options (Docker, uvx, npm)
- CI/CD integration
- Cloud deployment guides

## Documentation

- [ARCHITECTURE.md](docs/ARCHITECTURE.md) - System design and architecture
- [CONFIGURATION.md](docs/CONFIGURATION.md) - Configuration guide
- [IMPLEMENTATION_PLAN.md](docs/IMPLEMENTATION_PLAN.md) - Development roadmap
- [CLAUDE.md](CLAUDE.md) - Developer guide for Claude Code

## Contributing

See [IMPLEMENTATION_PLAN.md](docs/IMPLEMENTATION_PLAN.md) for development workflow.

## License

Private

## Acknowledgments

Built with research from:

- [GitHub Copilot Semantic Indexing](https://github.blog/changelog/2025-03-12-instant-semantic-code-search-indexing-now-generally-available-for-github-copilot/)
- [Claude Context MCP](https://github.com/zilliztech/claude-context)
- [AST-Aware Code Chunking](https://supermemory.ai/blog/building-code-chunk-ast-aware-code-chunking/)
