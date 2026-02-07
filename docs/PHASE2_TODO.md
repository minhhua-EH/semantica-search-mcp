# Phase 2 TODO - Optimization & Enhancement

**Version**: 2.0.0-alpha
**Focus**: Fix known issues, optimize performance, improve quality
**Timeline**: 3-4 weeks
**Prerequisites**: Phase 1 complete (v1.0.0-alpha)

## Overview

Phase 2 shifts from "new features" to "optimization and enhancement". We'll fix the known issues from Phase 1, improve search quality, and optimize performance before adding new providers or languages.

**Philosophy**: Make it excellent before making it bigger.

## High Priority - Fix Known Issues

### 1. Eliminate Ollama 500 Errors ⭐⭐⭐

**Current State:**
- 5-6% of chunks fail with HTTP 500 errors
- Consistent batches fail (24, 28, 32)
- 3 retries don't help

**Root Cause Investigation:**
- [ ] Monitor Ollama resources during indexing (memory, CPU)
- [ ] Check Ollama logs for errors at failure points
- [ ] Analyze failed chunk content for patterns
- [ ] Test with Ollama restart between batches
- [ ] Measure request rate and identify throttling

**Solutions to Implement:**

**Task 1.1: Add Inter-Batch Delays**
```typescript
// In IndexingService, after each batch
await sleep(500); // 500ms delay to give Ollama breathing room
```
- [ ] Add configurable delay setting in PerformanceConfig
- [ ] Implement delay between embedding batches
- [ ] Test with delays: 100ms, 500ms, 1000ms
- [ ] Measure impact on success rate
- **Acceptance**: 99%+ success rate OR understand why delays don't help

**Task 1.2: Implement Circuit Breaker Pattern**
```typescript
// Track consecutive failures, pause if too many
if (consecutiveFailures > 3) {
  await sleep(5000); // Cool down
  consecutiveFailures = 0;
}
```
- [ ] Create CircuitBreaker utility class
- [ ] Integrate with OllamaProvider
- [ ] Configure thresholds (3 failures, 5s cool down)
- [ ] Test on form-config-poc
- **Acceptance**: Reduces consecutive failures

**Task 1.3: Parallel Embedding with Concurrency Limit**
```typescript
// Use Promise.all with p-limit for controlled concurrency
const limiter = pLimit(3); // Max 3 concurrent
const embeddings = await Promise.all(
  texts.map(t => limiter(() => this.embed(t)))
);
```
- [ ] Install `p-limit` package
- [ ] Implement controlled parallel embedding
- [ ] Make concurrency configurable
- [ ] Test impact on Ollama
- **Acceptance**: Better performance without increasing errors

**Task 1.4: Investigate Ollama Configuration**
- [ ] Document Ollama version and settings
- [ ] Check `~/.ollama/` for config files
- [ ] Research Ollama memory/thread settings
- [ ] Try increasing Ollama resources (if possible)
- [ ] Consider Ollama in Docker with resource limits
- **Acceptance**: Understand Ollama limitations

**Estimated Time**: 1 week
**Success Metric**: 99%+ indexing success rate

---

### 2. Implement AST Split-Merge Chunking ⭐⭐⭐

**Current State:**
- Basic AST extraction (whole functions/classes)
- Large functions not split
- Small functions not merged
- Search quality: 3.5/5 for some queries

**Goal:**
- Implement research-backed recursive split-merge
- Respect 250-token limit
- Merge small siblings
- Improve search quality by 40% (research target)

**Tasks:**

**Task 2.1: Create Chunker Interface**
```typescript
interface Chunker {
  chunk(nodes: CodeNode[], maxTokens: number): CodeChunk[];
}
```
- [ ] Define Chunker interface in `src/chunkers/base.ts`
- [ ] Add chunking strategy selection logic
- [ ] Create chunker factory
- **Files**: `src/chunkers/base.ts`, `src/chunkers/factory.ts`

**Task 2.2: Implement AST Split-Merge Chunker**
Based on [cAST research](https://arxiv.org/html/2506.15655v1):
- [ ] Implement recursive split algorithm
  - If node > maxTokens → split children
  - Recursively split until all under limit
- [ ] Implement merge algorithm
  - If siblings combined < maxTokens → merge
  - Avoid fragmentation
- [ ] Add token counting per node
- [ ] Handle edge cases (single large node)
- **File**: `src/chunkers/ast-split-merge.ts` (~300 lines)

**Task 2.3: Integrate with Parsers**
- [ ] Update TypeScriptParser to use chunker
- [ ] Update RubyParser to use chunker
- [ ] Add chunker selection based on config
- [ ] Test with real codebases
- **Files**: `src/parsers/typescript.parser.ts`, `src/parsers/ruby.parser.ts`

**Task 2.4: Test & Validate**
- [ ] Create test fixtures (large functions, small functions)
- [ ] Verify chunk sizes (all < 250 tokens)
- [ ] Verify merging (small siblings combined)
- [ ] Compare search quality before/after
- **Files**: `tests/unit/chunkers/ast-split-merge.test.ts`

**Estimated Time**: 1-1.5 weeks
**Success Metric**: 40% improvement in search quality, all chunks < 250 tokens

---

### 3. Improve Error Handling & Logging ⭐⭐

**Current State:**
- Silent logger in MCP mode (necessary but limits debugging)
- Generic error messages
- Stderr logging works but isn't captured reliably
- No persistent debug logs

**Tasks:**

**Task 3.1: File-Based Debug Logging**
- [ ] Add `SEMANTICA_DEBUG` environment variable
- [ ] Write debug logs to `~/.semantica/debug/` when enabled
- [ ] Log rotation (keep last 10 files)
- [ ] Structured JSON logging
- **File**: `src/utils/file-logger.ts`

**Task 3.2: Better Error Messages**
- [ ] Map error codes to user-friendly messages
- [ ] Include remediation steps
- [ ] Show progress even on failure
- Example:
  ```
  ⚠️ Indexing partially complete (94%)

  ✅ Successfully indexed: 198/210 chunks
  ❌ Failed: 12 chunks due to Ollama timeout

  💡 Suggestions:
  - Reduce batchSize to 2 in config
  - Restart Ollama: ollama restart
  - Check Ollama logs: ~/.ollama/logs/
  ```
- **Files**: `src/utils/errors.ts`, `src/index.ts`

**Task 3.3: Progress Reporting**
- [ ] Return progress updates via MCP
- [ ] Show ETA for long operations
- [ ] Real-time status (not just callbacks)
- **File**: `src/services/indexing.service.ts`

**Estimated Time**: 3-4 days
**Success Metric**: Clear, actionable error messages

---

## Medium Priority - Optimization

### 4. Search Quality Improvements ⭐⭐

**Current State:**
- Literal queries ("base class") have lower scores
- No query expansion
- Simple keyword extraction

**Tasks:**

**Task 4.1: Query Expansion**
- [ ] Add synonym support
  - "validation" → ["validate", "validator", "check"]
  - "base class" → ["base", "parent", "superclass"]
- [ ] Expand query terms before embedding
- [ ] Make synonyms configurable
- **File**: `src/services/search.service.ts` + `src/utils/synonyms.ts`

**Task 4.2: Better Keyword Extraction**
- [ ] Use TF-IDF for keyword weighting
- [ ] Remove more stop words
- [ ] Code-specific keyword extraction
- **File**: `src/models/code-chunk.ts`

**Task 4.3: Dynamic Hybrid Weights**
- [ ] Adjust weights based on query type
  - Code-heavy query → more vector weight
  - Keyword-heavy query → more keyword weight
- [ ] Learn from user feedback
- **File**: `src/services/search.service.ts`

**Estimated Time**: 1 week
**Success Metric**: Improve "limited results" cases to "good results"

---

### 5. Performance Optimization ⭐⭐

**Tasks:**

**Task 5.1: Parallel Embedding Generation**
- [ ] Install `p-limit` for concurrency control
- [ ] Implement parallel embedBatch with limit
- [ ] Make concurrency configurable (default: 3)
- [ ] Test impact on Ollama errors
- **File**: `src/providers/embedding/ollama.provider.ts`

**Task 5.2: Embedding Cache**
- [ ] Cache embeddings by content hash
- [ ] Store in `.semantica/cache/embeddings/`
- [ ] Configurable TTL
- [ ] Speed up re-indexing
- **File**: `src/services/cache.service.ts`

**Task 5.3: Connection Pooling**
- [ ] Reuse Milvus client connections
- [ ] Connection pool for Ollama requests
- [ ] Proper cleanup on exit
- **Files**: Provider files

**Estimated Time**: 1 week
**Success Metric**: 30-50% faster indexing

---

### 6. Incremental Indexing ⭐⭐

**Current State:**
- Merkle tree utilities implemented
- Not integrated with IndexingService
- Always full re-index

**Tasks:**

**Task 6.1: Integrate Merkle Trees**
- [ ] Build Merkle tree after initial index
- [ ] Store in `.semantica/merkle/<project-hash>.json`
- [ ] Compare trees on re-index
- [ ] Identify added/modified/deleted files
- **File**: `src/services/merkle.service.ts`

**Task 6.2: Delta Indexing**
- [ ] Only parse changed files
- [ ] Delete vectors for removed files
- [ ] Update vectors for modified files
- [ ] Add vectors for new files
- **File**: `src/services/indexing.service.ts`

**Task 6.3: Watch Mode**
- [ ] Use `chokidar` to watch file changes
- [ ] Auto re-index on change
- [ ] Debounce (wait for multiple changes)
- [ ] Configurable watch patterns
- **File**: `src/services/watch.service.ts`

**Estimated Time**: 1 week
**Success Metric**: < 5 seconds for incremental update of 10 changed files

---

## Low Priority - Nice to Have

### 7. Unit Tests ⭐

**Tasks:**
- [ ] Add tests for FileService
- [ ] Add tests for IndexingService (mocked providers)
- [ ] Add tests for SearchService (mocked providers)
- [ ] Add tests for ConfigLoader
- [ ] Add tests for utilities (hash, tokens)
- [ ] Add parser tests with fixtures
- **Target**: 80% overall code coverage

**Estimated Time**: 3-4 days

---

### 8. Better Documentation ⭐

**Tasks:**
- [ ] Create API.md with all interfaces
- [ ] Add inline code examples
- [ ] Create troubleshooting guide
- [ ] Add FAQ
- [ ] Create video tutorial
- [ ] Add mermaid diagrams

**Estimated Time**: 2-3 days

---

### 9. Developer Experience ⭐

**Tasks:**
- [ ] Add `semantica` CLI tool
  - `semantica index`
  - `semantica search`
  - `semantica config`
  - `semantica doctor` (health check)
- [ ] Add progress bars for CLI
- [ ] Add colored output
- [ ] Add interactive configuration wizard

**Estimated Time**: 1 week

---

## Deferred to Phase 3 - New Features

These were originally planned for Phase 2 but are now Phase 3:

### New Providers
- [ ] Qdrant vector DB support
- [ ] OpenAI embedding support
- [ ] Pinecone vector DB support
- [ ] HuggingFace embedding support

### New Languages
- [ ] JavaScript (.js, .jsx)
- [ ] Python (.py)
- [ ] Go (.go)
- [ ] Java (.java)

### Advanced Features
- [ ] BM25 true keyword search
- [ ] Dependency graph search
- [ ] Code similarity detection
- [ ] Multi-repo support
- [ ] Web dashboard UI

---

## Phase 2 Implementation Plan

### Week 1: Fix Ollama Issues
- Days 1-2: Investigate Ollama errors, add monitoring
- Days 3-4: Implement batch delays, circuit breaker
- Days 5-7: Test and validate, achieve 99%+ success

### Week 2: AST Split-Merge Chunking
- Days 8-9: Create chunker interface and factory
- Days 10-12: Implement split-merge algorithm
- Days 13-14: Integrate with parsers, test thoroughly

### Week 3: Search & Performance
- Days 15-16: Query expansion and better keyword extraction
- Days 17-18: Parallel embedding and caching
- Days 19-21: Incremental indexing with Merkle trees

### Week 4: Polish & Testing
- Days 22-24: Add unit tests
- Days 25-26: Improve documentation
- Days 27-28: End-to-end testing, performance benchmarking

## Success Criteria for Phase 2

| Metric | Phase 1 | Phase 2 Target | How to Measure |
|--------|---------|----------------|----------------|
| Indexing success rate | 94% | 99%+ | All Ollama errors eliminated |
| Search accuracy | 85% | 90%+ | User feedback on relevance |
| Indexing speed (67 files) | 15-17s | < 10s | Benchmark test |
| Search with "limited results" | 25% | < 10% | Query quality evaluation |
| Unit test coverage | 0% (services) | 80% | jest --coverage |
| Incremental re-index (10 files) | N/A | < 5s | Merkle tree delta |

## Detailed Task Breakdown

### Task List (Prioritized)

#### P0 - Must Have
- [ ] #1.1: Add inter-batch delays (2 hours)
- [ ] #1.2: Implement circuit breaker (4 hours)
- [ ] #1.3: Investigate Ollama configuration (4 hours)
- [ ] #2.1: Create chunker interface (2 hours)
- [ ] #2.2: Implement AST split-merge (2 days)
- [ ] #2.3: Integrate chunkers with parsers (1 day)
- [ ] #3.1: File-based debug logging (1 day)
- [ ] #3.2: Better error messages (1 day)

#### P1 - Should Have
- [ ] #4.1: Query expansion with synonyms (2 days)
- [ ] #4.2: Better keyword extraction (1 day)
- [ ] #5.1: Parallel embedding with p-limit (1 day)
- [ ] #5.2: Embedding cache (1 day)
- [ ] #6.1: Integrate Merkle trees (2 days)
- [ ] #6.2: Delta indexing (2 days)

#### P2 - Nice to Have
- [ ] #6.3: Watch mode for auto re-index (2 days)
- [ ] #7: Unit tests for services (3 days)
- [ ] #8: Better documentation (2 days)
- [ ] #9: Developer CLI tool (1 week)

## Testing Plan

### For Each Task

**Before:**
1. Document current behavior
2. Define acceptance criteria
3. Create test cases

**During:**
1. Write tests first (TDD)
2. Implement feature
3. Run tests

**After:**
1. Integration test
2. Performance benchmark
3. Document changes

### Regression Testing

After each change, run:
```bash
npm test                          # Unit & integration tests
npx tsx scripts/test-indexing.ts  # Self-test
npx tsx scripts/test-mcp-direct.ts # form-config-poc test
```

### Performance Benchmarking

Create `scripts/benchmark.ts`:
- [ ] Benchmark indexing speed (26, 67, 100, 500 files)
- [ ] Benchmark search latency (1, 10, 100 queries)
- [ ] Benchmark memory usage
- [ ] Compare before/after each optimization
- [ ] Generate performance report

## Configuration Changes

### New Configuration Options for Phase 2

```json
{
  "embedding": {
    "batchSize": 4,
    "maxRetries": 3,  // NEW
    "retryDelay": 1000,  // NEW
    "concurrency": 3,  // NEW - for parallel embedding
    "cacheEnabled": true  // NEW
  },
  "performance": {
    "batchDelay": 500,  // NEW - delay between batches
    "circuitBreaker": {  // NEW
      "enabled": true,
      "failureThreshold": 3,
      "cooldownMs": 5000
    }
  },
  "chunking": {  // NEW section
    "strategy": "ast-split-merge",
    "maxTokens": 250,
    "minTokens": 50,
    "mergeSiblings": true
  },
  "search": {
    "queryExpansion": true,  // NEW
    "synonyms": {  // NEW
      "validation": ["validate", "validator", "check"],
      "base": ["parent", "superclass", "abstract"]
    }
  },
  "logging": {  // NEW
    "file": "~/.semantica/debug/semantica.log",
    "rotation": true,
    "maxFiles": 10
  }
}
```

## Migration Guide

### From Phase 1 to Phase 2

**Config Migration:**
1. Old configs will continue to work (backward compatible)
2. New options have sensible defaults
3. Add migration script: `scripts/migrate-config.ts`

**Re-indexing:**
- Phase 2 with split-merge will create different chunks
- Recommend full re-index after Phase 2 deployment
- Provide migration tool to preserve user data

**No Breaking Changes:**
- All Phase 1 APIs remain unchanged
- MCP tools have same signatures
- Configuration is additive only

## Risks & Mitigation

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| AST split-merge doesn't improve quality | High | Low | A/B test before full deployment |
| Parallel embedding increases Ollama errors | High | Medium | Make concurrency configurable (1-10) |
| Batch delays slow down indexing too much | Medium | Low | Make delays configurable (0-2000ms) |
| Merkle trees add complexity without value | Medium | Low | Make incremental indexing opt-in |
| Breaking changes affect Phase 1 users | High | Low | Strict backward compatibility policy |

## Definition of Done - Phase 2

Phase 2 is complete when:

1. ✅ Ollama error rate < 1% (currently 5-6%)
2. ✅ AST split-merge chunking implemented and tested
3. ✅ Search quality improved (fewer "limited results")
4. ✅ File-based debug logging works
5. ✅ Incremental indexing functional
6. ✅ Unit test coverage > 80%
7. ✅ Documentation updated
8. ✅ Tested on 3+ real codebases
9. ✅ Performance benchmarks documented
10. ✅ No regressions from Phase 1

## Deliverables Checklist

### Code
- [ ] AST split-merge chunker implementation
- [ ] Circuit breaker pattern
- [ ] Parallel embedding with concurrency control
- [ ] Merkle tree integration
- [ ] File-based logging
- [ ] Query expansion
- [ ] Unit tests (>80% coverage)

### Documentation
- [ ] Update ARCHITECTURE.md with new chunking
- [ ] Update CONFIGURATION.md with new options
- [ ] Create MIGRATION_GUIDE.md for Phase 1 → 2
- [ ] Update README.md
- [ ] Create PHASE2_FINAL_REPORT.md

### Testing
- [ ] Unit tests for all new components
- [ ] Integration tests for chunking
- [ ] Performance benchmarks
- [ ] Regression test suite

### Deployment
- [ ] Build and verify
- [ ] Tag v2.0.0-alpha
- [ ] Update installation instructions
- [ ] Provide migration path

## Resources Needed

### Dependencies to Add
```json
{
  "p-limit": "^5.0.0",  // Concurrency control
  "chokidar": "^3.5.0",  // File watching
  "winston": "^3.11.0"  // File logging (optional)
}
```

### Development Tools
- Performance profiling tools
- Benchmark suite
- Code coverage tools (jest --coverage)

## Open Questions for Phase 2

1. **Ollama Alternative**: If we can't fix 500 errors, should we implement OpenAI as fallback?
2. **Chunking Strategy**: Allow per-language chunking strategies?
3. **Caching Strategy**: LRU, TTL, or size-based eviction?
4. **Watch Mode**: Should it be opt-in or default?
5. **Query Expansion**: Manual synonyms or automatic (word2vec)?

## Notes

- Keep Phase 1 behavior as fallback (if Phase 2 features fail)
- All optimizations should be configurable (can disable if issues)
- Maintain backward compatibility
- Don't optimize prematurely - measure first

---

## Quick Reference

**To start Phase 2:**
1. Review this document
2. Set up new branch: `git checkout -b phase-2`
3. Start with Task #1.1 (batch delays)
4. Work through P0 tasks first

**To test Phase 2 changes:**
```bash
npm test
npx tsx scripts/test-indexing.ts
npx tsx scripts/test-mcp-direct.ts
npm run test:coverage
```

**To measure success:**
- Index form-config-poc again
- Compare Ollama error rate (target: < 1%)
- Compare search quality (fewer "limited results")
- Measure indexing speed (target: < 10s for 67 files)

---

**Phase 2: Optimization & Enhancement**
**Goal: Make it excellent before making it bigger** 🎯
