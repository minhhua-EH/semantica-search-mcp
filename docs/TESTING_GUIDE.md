# Testing Guide - Real Codebase Testing

## How to Test Semantica Search on Real Codebases

### Prerequisites

1. **Milvus running**: `curl http://localhost:19530/healthz`
2. **Ollama running**: `ollama list` (should show nomic-embed-text)
3. **Built**: `npm run build`

## Option 1: Using the Test Script

### Test on Current Project

```bash
npx tsx scripts/test-indexing.ts
```

This will:

- Index the current project
- Perform 4 sample searches
- Show detailed results

### Test on Another Project

Create a custom test script:

```typescript
// scripts/test-custom.ts
import { loadConfig } from "../src/config/loader.js";
import { IndexingService } from "../src/services/indexing.service.js";
import { SearchService } from "../src/services/search.service.js";

const projectRoot = "/path/to/your/project";
const config = loadConfig();

const indexer = new IndexingService(config, projectRoot);
const searcher = new SearchService(config);

// Index
await indexer.indexCodebase((progress) => {
  console.log(progress.message);
});

// Search
const results = await searcher.search("your query");
console.log(results);
```

## Option 2: Using MCP Tools in Claude Code

### 1. Configure Claude Desktop

Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "semantica-search": {
      "command": "/Users/huaanhminh/Projects/semantica-search-mcp/build/index.js"
    }
  }
}
```

### 2. Restart Claude Desktop

### 3. Use Tools in Claude Code

```
> Use index_codebase tool with:
  {
    "path": "/Users/you/your-project"
  }

> Use search_code tool with:
  {
    "query": "find authentication logic",
    "maxResults": 10,
    "language": "typescript"
  }

> Use get_index_status tool
```

## What to Test

### TypeScript Projects

Good test projects:

- Your own TypeScript projects
- Open source: express, nest.js, etc.
- Size range: 100-5000 files

**Test queries:**

- "authentication logic"
- "database connection"
- "API endpoint handlers"
- "validation functions"
- "error handling"

### Ruby Projects

Good test projects:

- Rails applications
- Ruby gems
- Size range: 100-5000 files

**Test queries:**

- "active record models"
- "controller actions"
- "service objects"
- "background jobs"
- "authentication"

## Evaluation Criteria

### Search Quality (Target: 80% accuracy)

For each query, check:

- ✅ Are top 3 results relevant?
- ✅ Are similarity scores reasonable (>0.6)?
- ✅ Are results from correct files?
- ✅ Are symbol names correct?

### Performance (Targets)

| Project Size | Target   | Acceptable |
| ------------ | -------- | ---------- |
| 100 files    | < 1 min  | < 2 min    |
| 1000 files   | < 5 min  | < 10 min   |
| 5000 files   | < 20 min | < 30 min   |

### Memory Usage

Monitor with: `htop` or Activity Monitor

- Target: < 2GB for 10k files
- Acceptable: < 4GB

## Common Issues & Solutions

### Issue: Ollama 500 Errors

**Cause**: Ollama timeout on complex code
**Solution**: Reduce batch size in config:

```json
{
  "embedding": {
    "batchSize": 16 // default is 32
  }
}
```

### Issue: Milvus Connection Failed

**Cause**: Milvus not running
**Solution**:

```bash
# Check status
docker ps | grep milvus

# Restart if needed
docker restart milvus-standalone
```

### Issue: No Results Found

**Possible causes:**

1. Collection not created - run `index_codebase` first
2. minScore too high - try 0.5 instead of 0.7
3. Wrong language filter - check file extensions

### Issue: Parsing Errors

**Cause**: Syntax errors in source files
**Solution**: These are logged but don't stop indexing

## Performance Optimization Tips

### 1. Adjust Batch Sizes

For faster indexing (less accuracy):

```json
{
  "embedding": {
    "batchSize": 64
  }
}
```

For better quality (slower):

```json
{
  "embedding": {
    "batchSize": 8
  }
}
```

### 2. Use Fast Preset

```bash
# In your project root
mkdir -p .semantica
cat > .semantica/config.json << 'EOF'
{
  "version": "1.0.0",
  "indexing": {
    "granularity": "file",
    "chunkingStrategy": "sliding-window"
  }
}
EOF
```

### 3. Limit File Size

```json
{
  "performance": {
    "maxFileSize": "500KB"
  }
}
```

## Collecting Feedback

After testing, note:

**Search Quality:**

- Which queries worked well?
- Which queries had poor results?
- Any false positives/negatives?

**Performance:**

- Indexing time for your project size
- Memory usage
- Search latency

**Issues:**

- Any errors encountered?
- Any missing features?
- Any confusing behavior?

This feedback will guide Phase 2 priorities!

## Example Test Session

```bash
# 1. Clear any existing index
npm run build

# 2. Run test on a project
npx tsx scripts/test-indexing.ts

# 3. Check results
# - Note indexing time
# - Note chunk count
# - Evaluate search results

# 4. Test different queries
# - Try 5-10 different queries
# - Note which work well
# - Note which don't

# 5. Document findings
# - Create notes.md in docs/
# - Share feedback for Phase 2 planning
```

## Success Metrics

**Minimum acceptable:**

- 70% of searches return relevant results
- < 10 min indexing for 1k files
- No crashes or data loss

**Ideal:**

- 85%+ of searches return relevant results
- < 5 min indexing for 1k files
- Smooth, fast user experience

---

**Ready to test!** Choose a codebase and let's evaluate the system! 🚀
