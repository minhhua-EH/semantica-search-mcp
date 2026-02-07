# Phase 1: Project Kickoff Summary

## 🎯 What We're Building

A **semantic code search MCP server** that enables Claude Code to understand and search through codebases using vector embeddings and intelligent chunking strategies.

## 📚 Documentation Created

1. **[ARCHITECTURE.md](./ARCHITECTURE.md)** - System design and architecture
   - MCP server structure
   - Provider pattern for extensibility
   - Configuration system with 6 indexing strategies
   - Data models and interfaces
   - Research-backed design decisions

2. **[CONFIGURATION.md](./CONFIGURATION.md)** - User configuration guide
   - Full configuration schema
   - All user-configurable options
   - Configuration presets (fast, quality, local)
   - CLI commands
   - Environment variables

3. **[IMPLEMENTATION_PLAN.md](./IMPLEMENTATION_PLAN.md)** - 4-week implementation roadmap
   - Week-by-week breakdown
   - Technology stack
   - Project structure
   - Testing strategy
   - Performance benchmarks
   - Risk mitigation

## 🔬 Research-Based Design

Our design is based on industry-leading implementations:

### Indexing Strategies

- **GitHub Copilot**: 250-token chunks, AST-based parsing
- **Sourcegraph Cody**: Hybrid search (keyword + vector + dependency graph)
- **Claude Context**: Merkle tree change detection, 40% token reduction

### Chunking Strategies

- **AST-Aware Chunking**: Recursive split-then-merge algorithm
- **Tree-sitter**: Multi-language AST parsing (battle-tested in Neovim, Helix, Zed)
- **Contextual Text**: Semantic metadata with embeddings

## ✨ Key Features

### 1. Multiple Indexing Granularities

- **file**: Whole file chunking
- **function**: Individual functions/methods
- **class**: Classes/modules
- **block**: Semantic code blocks
- **hybrid**: Smart mix (default) - GitHub Copilot's approach
- **fixed**: Fixed-size with overlap

### 2. Intelligent Chunking

- **ast-split-merge**: Recursive AST-based (default, highest quality)
- **ast-extract**: Fast extraction of specific nodes
- **sliding-window**: Language-agnostic fallback

### 3. Flexible Search

- **semantic**: Pure vector similarity
- **keyword**: BM25 text search
- **hybrid**: Combined approach (default, 40% more efficient)
- **graph**: Include dependency information

### 4. Smart Re-indexing

- **manual**: User-triggered
- **watch**: File watcher based
- **incremental**: Merkle tree tracking (default, most efficient)
- **scheduled**: Cron-like scheduling

### 5. Configurable Results

- **snippet**: 3-10 lines with context
- **context**: Full function/class
- **file**: Whole file with highlights
- **hybrid**: Smart formatting (default)
- **ranked**: Multiple results with scores

## 🏗️ Architecture Highlights

### Provider Pattern

```
EmbeddingProvider (interface)
├── OllamaProvider (Phase 1)
└── OpenAIProvider (Phase 2)

VectorDBProvider (interface)
├── MilvusProvider (Phase 1)
└── QdrantProvider (Phase 2)
```

### Core Flow

```
Discover Files → Parse (AST) → Chunk → Embed → Store in Vector DB
                                                      ↓
User Query → Embed Query → Vector Search → Format Results → Return
```

### Change Detection

```
Merkle Tree Snapshot → Detect Changes → Re-index Only Changed Files
```

## 📦 Technology Stack

| Component       | Choice                    | Why                                  |
| --------------- | ------------------------- | ------------------------------------ |
| **Runtime**     | Node.js 18+               | Modern, async, great ecosystem       |
| **Language**    | TypeScript 5.3+           | Type safety, better DX               |
| **MCP SDK**     | @modelcontextprotocol/sdk | Official SDK                         |
| **Vector DB**   | Milvus 2.4+               | Open-source, performant, local-first |
| **Embeddings**  | Ollama + nomic-embed-text | Local, privacy-friendly, free        |
| **Code Parser** | tree-sitter               | Battle-tested, multi-language        |
| **Testing**     | Jest                      | Standard, comprehensive              |

## 🎯 Phase 1 Goals

- ✅ Support **Milvus** (local) vector database
- ✅ Support **Ollama** with nomic-embed-text
- ✅ Index **TypeScript** and **Ruby** codebases
- ✅ Implement **all configurable options** (granularity, chunking, search)
- ✅ Provide **MCP tools** for Claude Code
- ✅ **Extensible architecture** ready for Phase 2

## 📅 Timeline: 4 Weeks

### Week 1: Foundation

- Configuration system
- Ollama provider
- Milvus provider
- Docker setup

### Week 2: Parsing & Chunking

- TypeScript parser (tree-sitter)
- Ruby parser (tree-sitter)
- AST-based chunking strategies
- Sliding window fallback

### Week 3: Core Services

- File discovery & filtering
- Merkle tree change detection
- Indexing orchestration
- Search service with hybrid support

### Week 4: MCP Integration

- MCP tools (index, search, configure, status)
- MCP resources (status, config, chunks)
- MCP prompts (explain, find similar)
- Testing & documentation

## 🎨 User Experience

### Initial Setup

```bash
# 1. Start Milvus
docker-compose up -d

# 2. Check Ollama
ollama list  # should show nomic-embed-text

# 3. Initialize project
semantica init --wizard

# 4. Index codebase
semantica index /path/to/project
```

### In Claude Code

```
# Index current project
> Use index_codebase tool

# Search semantically
> Use search_code tool with query "authentication logic"

# Get indexing status
> Use get_status tool
```

### Configuration

```bash
# Set granularity
semantica config set indexing.granularity function

# Use preset
semantica config preset quality

# View config
semantica config get
```

## 📊 Performance Targets

| Metric              | Small (100 files) | Medium (1k files) | Large (10k files) |
| ------------------- | ----------------- | ----------------- | ----------------- |
| **Index time**      | < 30 sec          | < 5 min           | < 10 min          |
| **Memory**          | < 200 MB          | < 500 MB          | < 2 GB            |
| **Search**          | < 500 ms          | < 1 sec           | < 2 sec           |
| **Token reduction** |                   | 40%               | (vs grep-only)    |

## 🔒 Privacy & Security

- ✅ **Local-first**: Ollama + Milvus can run entirely locally
- ✅ **No data leaks**: No code sent to external APIs (unless user chooses OpenAI in Phase 2)
- ✅ **Respects .gitignore**: Automatically excludes git-ignored files
- ✅ **Custom exclusions**: User-defined exclude patterns

## 🧪 Testing Strategy

- **Unit tests**: All components (80%+ coverage target)
- **Integration tests**: Real Ollama + Milvus
- **End-to-end tests**: Full indexing + search workflows
- **Performance tests**: Benchmark against targets
- **Real codebases**: Test with TypeScript & Ruby projects

## 🚀 Phase 2 Preview

After Phase 1 completion:

- ✅ **Qdrant** support (alternative vector DB)
- ✅ **OpenAI embeddings** (text-embedding-3-small/large)
- ✅ **More languages** (Python, Go, Java, JavaScript)
- ✅ **True BM25 hybrid search** (not just keyword extraction)
- ✅ **Monitoring dashboard** (web UI)
- ✅ **Multiple deployment options** (Docker, uvx, npm)

## 📋 Next Steps

### Immediate Actions Needed from You:

1. **Review and approve** this design
2. **Confirm** Milvus is running: `docker ps` (should show milvus containers)
3. **Confirm** Ollama is ready: `ollama list` (should show nomic-embed-text)
4. **Decide** on any modifications to the plan

### Then We'll Start:

1. **Day 1-2**: Update package.json, implement configuration system
2. **Day 3-4**: Build Ollama provider with health checks
3. **Day 5-7**: Build Milvus provider with full CRUD operations
4. **Continue** following the 4-week implementation plan

## 🤝 Collaboration Model

I'll act as:

- **Product Owner**: Prioritize features, validate requirements
- **Architect**: Design systems, make technical decisions
- **Tech Lead**: Break down tasks, review code, manage risks
- **Developer**: Write code, tests, documentation
- **Tester**: Ensure quality, write tests, validate functionality

You provide:

- Requirements clarification
- Feedback on design decisions
- Testing on real codebases
- Final approval on deliverables

## 📝 Questions Before We Start

1. **Design approval**: Does this architecture and plan meet your expectations?
2. **Timeline**: Is 4 weeks reasonable, or do you have a different timeline in mind?
3. **Priorities**: Any features you want prioritized or deprioritized?
4. **Testing**: Do you have specific codebases you want to test with during development?
5. **Deployment**: For Phase 1, is local development sufficient, or do you need deployment considerations?

## 📖 Additional Resources

- [GitHub Copilot Semantic Indexing](https://github.blog/changelog/2025-03-12-instant-semantic-code-search-indexing-now-generally-available-for-github-copilot/)
- [AST-Aware Code Chunking](https://supermemory.ai/blog/building-code-chunk-ast-aware-code-chunking/)
- [Claude Context MCP](https://github.com/zilliztech/claude-context)
- [Building RAG on Codebases](https://lancedb.com/blog/building-rag-on-codebases-part-1/)
- [How Cursor Indexes Codebases](https://read.engineerscodex.com/p/how-cursor-indexes-codebases-fast)

---

**Ready to start building? Let me know if you approve this plan, and I'll begin implementation immediately!** 🚀
