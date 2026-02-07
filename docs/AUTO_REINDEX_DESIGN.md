# Auto Re-Index Design Document

**Feature:** Automatic re-indexing on code changes, git operations, and crash recovery
**Phase:** 2 (Final requirement)
**Status:** Design/Planning
**Date:** February 8, 2026

---

## 🎯 Requirements

### 1. Code Change Detection

- **Trigger:** File modifications, additions, deletions
- **Behavior:** Auto re-index changed files only (incremental)
- **Debounce:** Wait for multiple changes before re-indexing

### 2. Git Branch Changes

- **Trigger:** Branch switch (checkout, switch)
- **Behavior:** Full re-index (different code)
- **Optimization:** Compare branches, re-index diffs only

### 3. Git Updates

- **Trigger:** Pull, merge, rebase
- **Behavior:** Incremental re-index of changed files
- **Detection:** Git diff between HEAD and previous state

### 4. Resume Interrupted Indexing

- **Trigger:** Process crash, manual termination
- **Behavior:** Resume from last checkpoint
- **State:** Persist indexing progress to disk

---

## 🏗️ Architecture Design

### High-Level Flow

```
┌─────────────────────────────────────────────────────────┐
│                  Trigger Detection                       │
├─────────────────────────────────────────────────────────┤
│  File Watcher  │  Git Hooks  │  Crash Recovery          │
│   (chokidar)   │  (git hooks)│  (state files)           │
└────────┬────────────┬──────────────┬─────────────────────┘
         │            │              │
         ▼            ▼              ▼
┌─────────────────────────────────────────────────────────┐
│              Re-Index Orchestrator                       │
│  • Determines re-index type (full/incremental)          │
│  • Debounces multiple changes                           │
│  • Manages state persistence                            │
└────────┬────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────┐
│           Incremental Indexing Engine                    │
│  • Merkle tree change detection                         │
│  • Delta computation (added/modified/deleted)           │
│  • Selective re-parsing                                 │
│  • Vector DB updates (upsert/delete)                    │
└─────────────────────────────────────────────────────────┘
```

### Component Breakdown

#### 1. File Watcher Service (`watch.service.ts`)

**Responsibilities:**

- Monitor file system for changes
- Debounce rapid changes
- Filter relevant files (ignore node_modules, etc.)
- Emit re-index events

**Technology:** `chokidar` (robust file watching)

**Pseudocode:**

```typescript
class WatchService {
  private watcher: FSWatcher;
  private debounceTimer: NodeJS.Timeout;
  private changedFiles: Set<string> = new Set();

  start(projectRoot: string, config: WatchConfig) {
    this.watcher = chokidar.watch(projectRoot, {
      ignored: config.excludePatterns,
      ignoreInitial: true,
      persistent: true,
    });

    this.watcher
      .on("add", (path) => this.handleChange(path, "added"))
      .on("change", (path) => this.handleChange(path, "modified"))
      .on("unlink", (path) => this.handleChange(path, "deleted"));
  }

  private handleChange(path: string, type: ChangeType) {
    this.changedFiles.add(path);

    // Debounce: Wait for 2 seconds of inactivity
    clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => {
      this.triggerReindex(Array.from(this.changedFiles));
      this.changedFiles.clear();
    }, 2000);
  }
}
```

#### 2. Git Hook Manager (`git-hook.service.ts`)

**Responsibilities:**

- Install git hooks (post-checkout, post-merge, post-rebase)
- Detect branch changes
- Calculate diff between branches/commits
- Trigger appropriate re-index

**Git Hooks to Install:**

| Hook            | Trigger          | Re-Index Type                 |
| --------------- | ---------------- | ----------------------------- |
| `post-checkout` | Branch switch    | Full or diff-based            |
| `post-merge`    | After merge/pull | Incremental (changed files)   |
| `post-rebase`   | After rebase     | Incremental                   |
| `post-commit`   | After commit     | Incremental (committed files) |

**Pseudocode:**

```typescript
class GitHookManager {
  async install(projectRoot: string) {
    const hooksDir = `${projectRoot}/.git/hooks`;

    // Install post-checkout hook
    await this.installHook(
      hooksDir,
      "post-checkout",
      `
      #!/bin/bash
      PREV_HEAD=$1
      NEW_HEAD=$2
      BRANCH_SWITCH=$3

      if [ "$BRANCH_SWITCH" = "1" ]; then
        # Branch changed - trigger re-index
        semantica-reindex --trigger=branch-change --from=$PREV_HEAD --to=$NEW_HEAD
      fi
    `,
    );

    // Install post-merge hook
    await this.installHook(
      hooksDir,
      "post-merge",
      `
      #!/bin/bash
      # After pull/merge - incremental re-index
      semantica-reindex --trigger=git-update --incremental
    `,
    );
  }

  async detectBranchChange(): Promise<BranchChange> {
    const currentBranch = await this.getCurrentBranch();
    const lastBranch = await this.getLastIndexedBranch();

    if (currentBranch !== lastBranch) {
      const diff = await this.getDiffBetweenBranches(lastBranch, currentBranch);
      return { changed: true, diff };
    }

    return { changed: false };
  }
}
```

#### 3. Crash Recovery Manager (`recovery.service.ts`)

**Responsibilities:**

- Persist indexing state to disk
- Detect incomplete indexing on startup
- Resume from last checkpoint

**State File:** `.semantica/indexing-state.json`

```json
{
  "jobId": "index_1770487890123",
  "status": "in_progress",
  "phase": "embedding",
  "progress": {
    "filesProcessed": 1234,
    "totalFiles": 3500,
    "chunksProcessed": 3456,
    "totalChunks": 10000
  },
  "checkpoints": [
    { "phase": "parsing", "completed": true, "timestamp": 1770487890000 },
    { "phase": "embedding", "completed": false, "progress": 3456 }
  ],
  "startTime": 1770487890000,
  "lastUpdate": 1770487920000
}
```

**Pseudocode:**

```typescript
class RecoveryManager {
  async checkForIncompleteIndexing(
    projectRoot: string,
  ): Promise<RecoveryState | null> {
    const statePath = `${projectRoot}/.semantica/indexing-state.json`;

    if (!exists(statePath)) return null;

    const state = await readJSON(statePath);

    // Check if indexing was interrupted (no update in 5+ minutes)
    const timeSinceUpdate = Date.now() - state.lastUpdate;
    if (state.status === "in_progress" && timeSinceUpdate > 300000) {
      return {
        canResume: true,
        lastPhase: state.phase,
        progress: state.progress,
        startTime: state.startTime,
      };
    }

    return null;
  }

  async resumeIndexing(state: RecoveryState): Promise<void> {
    // Resume from last checkpoint
    // Skip already-processed files
    // Continue from where it left off
  }

  async saveCheckpoint(state: IndexingState): Promise<void> {
    // Persist current state to disk
    // Called after each phase completes
  }
}
```

#### 4. Incremental Re-Index Engine (`incremental.service.ts`)

**Responsibilities:**

- Use Merkle trees to detect changes
- Calculate delta (added/modified/deleted files)
- Update vectors (upsert/delete operations)
- Maintain index consistency

**Already implemented:** `MerkleService` (Phase 1)
**Needs:** Integration with IndexingService

**Pseudocode:**

```typescript
class IncrementalIndexingService {
  async reindexChanges(changes: FileChanges): Promise<ReindexResult> {
    const { added, modified, deleted } = changes;

    // 1. Delete vectors for removed files
    for (const file of deleted) {
      const chunks = await this.findChunksByFile(file);
      await this.vectorDB.delete(chunks.map((c) => c.id));
    }

    // 2. Re-index modified files
    for (const file of modified) {
      // Delete old chunks
      const oldChunks = await this.findChunksByFile(file);
      await this.vectorDB.delete(oldChunks.map((c) => c.id));

      // Index new version
      const newChunks = await this.parseAndEmbed(file);
      await this.vectorDB.insert(newChunks);
    }

    // 3. Index new files
    for (const file of added) {
      const chunks = await this.parseAndEmbed(file);
      await this.vectorDB.insert(chunks);
    }

    // 4. Update Merkle tree
    await this.merkleService.updateTree(changes);
  }
}
```

---

## ⚙️ Configuration Design

### New Config Section: `autoReindex`

```json
{
  "autoReindex": {
    "enabled": true,

    "watch": {
      "enabled": true,
      "debounceMs": 2000,
      "patterns": ["app/**", "lib/**"],
      "ignored": ["node_modules/**", "tmp/**"]
    },

    "gitHooks": {
      "enabled": true,
      "installHooks": true,
      "triggers": {
        "branchChange": "full", // "full" | "incremental" | "disabled"
        "afterPull": "incremental",
        "afterMerge": "incremental",
        "afterCommit": "disabled"
      }
    },

    "crashRecovery": {
      "enabled": true,
      "checkpointInterval": 100, // Save state every 100 chunks
      "autoResume": true, // Auto-resume on startup
      "maxAge": 3600000 // Don't resume if >1 hour old
    },

    "incremental": {
      "enabled": true,
      "useMerkleTree": true,
      "batchSize": 10, // Re-index 10 files at a time
      "maxConcurrent": 5
    }
  }
}
```

---

## 🔄 Workflows

### Workflow 1: File Change Detection

```
1. Developer saves file: app/models/user.rb
   ↓
2. Chokidar detects change
   ↓
3. Debounce timer starts (2s)
   ↓
4. Developer saves another file: app/services/auth.rb
   ↓
5. Timer resets
   ↓
6. 2 seconds of inactivity
   ↓
7. Trigger incremental re-index:
   - Parse user.rb and auth.rb
   - Generate embeddings
   - Delete old vectors
   - Insert new vectors
   ↓
8. Update Merkle tree
   ↓
9. Done (took ~5 seconds)
```

### Workflow 2: Git Branch Change

```
1. Developer runs: git checkout feature-branch
   ↓
2. Git post-checkout hook fires
   ↓
3. Detect branch change (main → feature-branch)
   ↓
4. Calculate diff:
   git diff main...feature-branch --name-only
   ↓
5. Decision:
   - If <100 files changed: Incremental re-index
   - If >100 files changed: Full re-index
   ↓
6. Execute re-index (background mode)
   ↓
7. User can continue working, check status
```

### Workflow 3: Crash Recovery

```
1. Indexing starts: 10,000 chunks to process
   ↓
2. Process 3,456 chunks
   ↓
3. Save checkpoint: indexing-state.json
   ↓
4. Process crashes (Ollama dies, system restart, etc.)
   ↓
5. User restarts MCP server
   ↓
6. Recovery manager checks for incomplete state
   ↓
7. Prompt user: "Resume indexing from 3,456/10,000?"
   ↓
8. If yes:
   - Skip already-processed files
   - Continue from chunk 3,456
   - Complete remaining 6,544 chunks
   ↓
9. Clean up state file when done
```

---

## 🗂️ File Structure

```
src/services/
├── watch.service.ts           # NEW - File watching
├── git-hook.service.ts        # NEW - Git integration
├── recovery.service.ts        # NEW - Crash recovery
├── incremental.service.ts     # NEW - Incremental indexing
├── merkle.service.ts          # EXISTS - Enhance for integration
└── indexing.service.ts        # MODIFY - Add incremental support

src/config/
└── schema.ts                  # MODIFY - Add autoReindex config

.semantica/
├── config.json                # User config
├── indexing-state.json        # NEW - Indexing state (crash recovery)
├── merkle/                    # EXISTS - Merkle trees
│   └── <project-hash>.json
├── checkpoints/               # NEW - Checkpoint data
│   └── <job-id>.json
└── git-state.json            # NEW - Last indexed git state
```

---

## 🔧 Implementation Plan

### Phase 1: Incremental Re-Indexing (Core)

**Week 3, Days 19-21 from PHASE2_TODO.md**

**Files to Create:**

1. `src/services/incremental.service.ts` (~300 lines)
   - Calculate file deltas
   - Update vectors (delete old, insert new)
   - Integrate Merkle trees

**Files to Modify:**

1. `src/services/indexing.service.ts`
   - Add `reindexFiles(files: string[])` method
   - Support incremental mode

2. `src/services/merkle.service.ts`
   - Already exists, enhance for integration
   - Add `getChangedFiles()` method

**Implementation Steps:**

```typescript
// 1. IncrementalIndexingService
class IncrementalIndexingService {
  async reindexChangedFiles(files: string[]): Promise<ReindexResult> {
    // Find old chunks for these files
    const oldChunks = await this.findChunksByFiles(files);

    // Delete old vectors
    await this.vectorDB.delete(oldChunks.map(c => c.id));

    // Re-parse and index
    const newChunks = await this.parseFiles(files);
    const embeddings = await this.embedChunks(newChunks);
    await this.vectorDB.insert(embeddings);

    // Update Merkle tree
    await this.merkleService.updateFiles(files);

    return { updated: files.length };
  }
}

// 2. Add to IndexingService
async reindexFiles(files: string[]): Promise<void> {
  const incremental = new IncrementalIndexingService(this.config);
  await incremental.reindexChangedFiles(files);
}
```

**Testing:**

- Change 1 file, verify only that file re-indexed
- Change 10 files, verify all 10 re-indexed
- Delete file, verify vectors removed
- Verify Merkle tree updates

**Acceptance Criteria:**

- ✅ Re-index 10 files in <5 seconds
- ✅ Vectors correctly updated/deleted
- ✅ Merkle tree stays in sync

---

### Phase 2: File Watching

**After Phase 1 Complete**

**Files to Create:**

1. `src/services/watch.service.ts` (~200 lines)
   - Chokidar integration
   - Debouncing logic
   - Event emission

**Dependencies:**

```json
{
  "chokidar": "^3.6.0"
}
```

**Implementation:**

```typescript
class WatchService {
  private watcher: FSWatcher | null = null;
  private debounceTimer: NodeJS.Timeout | null = null;
  private pendingChanges: Map<string, ChangeType> = new Map();

  async start(
    projectRoot: string,
    config: WatchConfig,
    onReindex: (files: string[]) => Promise<void>,
  ): Promise<void> {
    this.watcher = chokidar.watch(projectRoot, {
      ignored: [
        /(^|[\/\\])\../, // Ignore dotfiles
        "**/node_modules/**",
        "**/dist/**",
        "**/build/**",
        ...config.ignored,
      ],
      ignoreInitial: true,
      persistent: true,
      awaitWriteFinish: {
        stabilityThreshold: 500,
        pollInterval: 100,
      },
    });

    this.watcher
      .on("add", (path) => this.queueChange(path, "added"))
      .on("change", (path) => this.queueChange(path, "modified"))
      .on("unlink", (path) => this.queueChange(path, "deleted"));

    logProgress("👁️  File watcher started");
  }

  private queueChange(path: string, type: ChangeType): void {
    // Only watch relevant files
    if (!this.isRelevantFile(path)) return;

    this.pendingChanges.set(path, type);

    // Debounce
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    this.debounceTimer = setTimeout(() => {
      this.processPendingChanges();
    }, config.debounceMs || 2000);
  }

  private async processPendingChanges(): Promise<void> {
    const changes = Array.from(this.pendingChanges.entries());
    this.pendingChanges.clear();

    if (changes.length === 0) return;

    logProgress(`🔄 Detected ${changes.length} file changes, re-indexing...`);

    const files = changes.map(([path]) => path);
    await this.onReindex(files);

    logProgress(`✅ Re-indexed ${files.length} files`);
  }

  stop(): void {
    if (this.watcher) {
      this.watcher.close();
    }
  }
}
```

**Configuration:**

```json
{
  "watch": {
    "enabled": false, // Off by default (opt-in)
    "debounceMs": 2000,
    "patterns": ["app/**", "lib/**"],
    "autoStart": false // Don't start automatically
  }
}
```

**MCP Tool:**

```typescript
{
  name: "start_watch_mode",
  description: "Start file watching for auto re-indexing",
  inputSchema: {
    properties: {
      path: { type: "string" }
    }
  }
}
```

**Testing:**

- Modify file, wait 2s, verify re-index
- Modify multiple files rapidly, verify single re-index
- Delete file, verify vectors removed

---

### Phase 3: Git Hook Integration

**After Phase 2 Complete**

**Files to Create:**

1. `src/services/git-hook.service.ts` (~250 lines)
   - Hook installation
   - Branch change detection
   - Diff calculation

**Hook Scripts:**

**`.git/hooks/post-checkout`:**

```bash
#!/bin/bash
# Semantica Search - Auto Re-Index on Branch Change

PREV_HEAD=$1
NEW_HEAD=$2
BRANCH_SWITCH=$3

if [ "$BRANCH_SWITCH" != "1" ]; then
  exit 0  # Not a branch switch
fi

# Get project root
PROJECT_ROOT=$(git rev-parse --show-toplevel)

# Trigger re-index via Node script
node "$PROJECT_ROOT/.semantica/hooks/post-checkout.js" "$PREV_HEAD" "$NEW_HEAD"
```

**`.semantica/hooks/post-checkout.js`:**

```javascript
const { execSync } = require("child_process");

const prevHead = process.argv[2];
const newHead = process.argv[3];

console.log(`[Semantica] Branch changed: ${prevHead} → ${newHead}`);
console.log(`[Semantica] Calculating diff...`);

// Get changed files
const diff = execSync(`git diff --name-only ${prevHead}...${newHead}`, {
  encoding: "utf-8",
});

const changedFiles = diff.split("\n").filter((f) => f.length > 0);

console.log(`[Semantica] ${changedFiles.length} files changed`);

if (changedFiles.length > 100) {
  console.log(`[Semantica] Large change detected, triggering full re-index`);
  // Trigger full re-index
} else {
  console.log(`[Semantica] Triggering incremental re-index`);
  // Trigger incremental re-index
}
```

**Installation:**

```typescript
// MCP tool to install hooks
{
  name: "install_git_hooks",
  description: "Install git hooks for auto re-indexing",
  inputSchema: {
    properties: {
      path: { type: "string" },
      hooks: {
        type: "array",
        items: { enum: ["post-checkout", "post-merge", "post-rebase"] }
      }
    }
  }
}
```

**Testing:**

- Switch branches, verify re-index triggered
- Pull changes, verify incremental update
- Large branch switch, verify full re-index

---

### Phase 4: Crash Recovery

**After Phase 3 Complete**

**Files to Create:**

1. `src/services/recovery.service.ts` (~200 lines)

**Implementation:**

```typescript
class RecoveryService {
  // Save state every 100 chunks
  async saveCheckpoint(state: IndexingState): Promise<void> {
    const statePath = `${state.projectRoot}/.semantica/indexing-state.json`;
    await writeJSON(statePath, {
      jobId: state.jobId,
      status: "in_progress",
      phase: state.currentPhase,
      progress: {
        filesProcessed: state.filesProcessed,
        totalFiles: state.totalFiles,
        chunksProcessed: state.chunksProcessed,
        totalChunks: state.totalChunks,
      },
      processedFiles: state.processedFiles, // List of files done
      lastUpdate: Date.now(),
    });
  }

  // Check on startup
  async checkAndRecover(projectRoot: string): Promise<void> {
    const state = await this.loadState(projectRoot);

    if (!state || state.status !== "in_progress") {
      return; // Nothing to recover
    }

    const age = Date.now() - state.lastUpdate;
    if (age > this.maxAge) {
      // Too old, discard
      await this.clearState(projectRoot);
      return;
    }

    // Prompt user to resume
    logProgress(`
      ⚠️  Incomplete indexing detected!

      Last session:
      - Phase: ${state.phase}
      - Progress: ${state.progress.chunksProcessed}/${state.progress.totalChunks}
      - Age: ${(age / 1000).toFixed(0)}s ago

      Resume? (Add resume=true to index_codebase tool)
    `);
  }

  async resume(state: IndexingState): Promise<void> {
    // Skip already-processed files
    const remaining = state.totalFiles.filter(
      (f) => !state.processedFiles.includes(f),
    );

    // Continue indexing
    await this.indexingService.indexFiles(remaining, {
      resumeFrom: state.chunksProcessed,
    });
  }
}
```

**MCP Tool Enhancement:**

```json
{
  "name": "index_codebase",
  "properties": {
    "path": { "type": "string" },
    "resume": {
      "type": "boolean",
      "description": "Resume interrupted indexing from checkpoint"
    }
  }
}
```

---

## 📊 State Management

### State Files

#### 1. `indexing-state.json` (Crash Recovery)

```json
{
  "jobId": "index_1770487890123",
  "status": "in_progress",
  "phase": "embedding",
  "progress": {
    "filesProcessed": 1234,
    "totalFiles": 3500,
    "chunksProcessed": 3456,
    "totalChunks": 10000
  },
  "processedFiles": [
    "app/models/user.rb",
    "app/models/post.rb",
    ...
  ],
  "checkpoints": [
    { "phase": "parsing", "completed": true, "chunks": 3456 },
    { "phase": "embedding", "completed": false, "progress": 2100 }
  ],
  "startTime": 1770487890000,
  "lastUpdate": 1770487920000
}
```

#### 2. `git-state.json` (Git Change Detection)

```json
{
  "branch": "main",
  "commit": "abc123def456",
  "lastIndexed": 1770487890000,
  "files": 3500,
  "chunks": 10000
}
```

#### 3. `watch-state.json` (Watch Mode Status)

```json
{
  "enabled": true,
  "watching": ["/Users/huaanhminh/Projects/ats"],
  "lastReindex": 1770487890000,
  "reindexCount": 15
}
```

---

## 🎛️ Control Flow

### Decision Tree: When to Re-Index

```
Change Detected
    │
    ├─ File Change (watch)
    │   ├─ 1-10 files → Incremental (immediate)
    │   ├─ 11-100 files → Incremental (debounced 2s)
    │   └─ >100 files → Prompt user (may be full re-index)
    │
    ├─ Git Branch Change
    │   ├─ <50 files changed → Incremental
    │   ├─ 50-500 files → Incremental (background)
    │   └─ >500 files → Full re-index (background)
    │
    ├─ Git Pull/Merge
    │   ├─ <100 files → Incremental (auto)
    │   └─ >100 files → Incremental (background, notify user)
    │
    └─ Crash Recovery
        ├─ <5 min old → Auto-resume
        ├─ 5-60 min old → Prompt user
        └─ >60 min old → Discard (too old)
```

---

## ⚡ Performance Optimization

### Incremental Re-Index Performance

**Target:**

- 1 file changed: <3 seconds
- 10 files changed: <10 seconds
- 100 files changed: <2 minutes

**Optimizations:**

1. **Batch operations** - Delete/insert in batches
2. **Parallel processing** - Reuse concurrency limit
3. **Skip unchanged** - Use Merkle tree diffing
4. **Minimal vector ops** - Only touch changed chunks

### Memory Management

**For large codebases:**

- Don't load all vectors into memory
- Stream operations
- Clean up after each batch
- Use vector DB's native upsert (if available)

---

## 🧪 Testing Strategy

### Unit Tests

**Test scenarios:**

1. ✅ Incremental re-index (1 file, 10 files, 100 files)
2. ✅ File deletion (vector removal)
3. ✅ Merkle tree updates
4. ✅ Debouncing (rapid changes)
5. ✅ Crash recovery (resume from checkpoint)
6. ✅ Git hook triggers

### Integration Tests

**Test scenarios:**

1. ✅ Full workflow: Change → Detect → Re-index → Search
2. ✅ Branch switch → Re-index → Search old vs new
3. ✅ Crash → Resume → Complete
4. ✅ Watch mode → Multiple changes → Debounce → Single re-index

### Manual Tests

**Test codebases:**

- form-config-poc (small, 67 files)
- ats (medium, 3,539 files)
- employment-hero (large, 30,884 files)

---

## 🎯 User Experience

### UX Flow 1: First Time Setup

```
User: "Index the ats codebase with auto re-indexing"

System:
✅ Initial indexing complete! (7 minutes)

📋 Auto Re-Index Options:
1. Enable file watching? (Auto re-index on file save)
2. Install git hooks? (Auto re-index on branch change)
3. Enable crash recovery? (Resume if interrupted)

Select options: [1, 2, 3]

User: Selects all

System:
✅ File watching enabled
✅ Git hooks installed
✅ Crash recovery enabled

Your codebase will now stay in sync automatically!
```

### UX Flow 2: During Development

```
# User switches branches
$ git checkout feature/new-auth

[Semantica] Branch changed: main → feature/new-auth
[Semantica] 45 files changed
[Semantica] 🔄 Incremental re-index started (background)...
[Semantica] ✅ Re-indexed 45 files in 15s

# User can immediately search new code
Use search_code: "authentication logic"
→ Returns results from feature/new-auth
```

### UX Flow 3: Crash Recovery

```
# Indexing crashes at 45%
System restart...

User opens Claude Code

System:
⚠️  Incomplete indexing detected for 'employment-hero'
Progress: 4,500/10,000 chunks (45%)
Started: 8 minutes ago

Would you like to resume indexing?

User: "Yes, resume indexing"

System:
🔄 Resuming from chunk 4,500...
✅ Completed remaining 5,500 chunks in 5 minutes
```

---

## 🛡️ Edge Cases & Handling

### Edge Case 1: Concurrent Changes While Indexing

**Scenario:** Files change while initial indexing is running

**Solution:**

- Queue changes during initial index
- Apply incremental update after initial index completes
- Prevent cascading re-indexes

### Edge Case 2: Branch with Deleted Files

**Scenario:** Switch to branch where files don't exist

**Solution:**

- Detect deleted files in diff
- Remove vectors for those files
- Update Merkle tree

### Edge Case 3: Large Merge (1000+ files)

**Scenario:** Merge large feature branch

**Solution:**

- Detect large change (>500 files)
- Prompt user: "Large merge detected, recommend full re-index?"
- Don't auto-trigger (too expensive)

### Edge Case 4: Watch Mode + Git Hook Conflict

**Scenario:** File watcher triggers at same time as git hook

**Solution:**

- Use lock mechanism (only one re-index at a time)
- Queue subsequent requests
- Merge duplicate file changes

### Edge Case 5: Corrupted State File

**Scenario:** indexing-state.json corrupted

**Solution:**

- Validate state file on load
- If invalid, discard and start fresh
- Log warning to user

---

## 🔒 Safety & Reliability

### Safety Mechanisms

**1. Lock File:**

```
.semantica/.indexing.lock
→ Prevents concurrent indexing operations
```

**2. State Validation:**

```typescript
function validateState(state: any): boolean {
  return (
    state.jobId &&
    state.status &&
    state.progress &&
    state.lastUpdate &&
    Date.now() - state.lastUpdate < 3600000 // <1 hour old
  );
}
```

**3. Graceful Degradation:**

- If watch fails → Log error, continue without watching
- If git hook fails → Log error, manual re-index still works
- If recovery fails → Start fresh

**4. Resource Limits:**

- Max pending changes: 1,000 files
- If exceeded, trigger full re-index instead

---

## 📋 Implementation Checklist

### Phase 1: Incremental Re-Indexing (Core) - 2-3 days

- [ ] Create IncrementalIndexingService
- [ ] Add `findChunksByFiles()` to vector DB provider
- [ ] Implement delta calculation with Merkle trees
- [ ] Add `reindexFiles()` to IndexingService
- [ ] Write unit tests for incremental logic
- [ ] Test with 1, 10, 100 file changes

### Phase 2: File Watching - 1-2 days

- [ ] Install chokidar dependency
- [ ] Create WatchService
- [ ] Implement debouncing
- [ ] Add start/stop watch MCP tools
- [ ] Test watch mode with real file changes
- [ ] Add watch state persistence

### Phase 3: Git Hook Integration - 1-2 days

- [ ] Create GitHookService
- [ ] Write git hook scripts (post-checkout, post-merge)
- [ ] Add hook installation logic
- [ ] Test branch switches and merges
- [ ] Handle hook failures gracefully
- [ ] Add uninstall hooks functionality

### Phase 4: Crash Recovery - 1 day

- [ ] Create RecoveryService
- [ ] Implement checkpoint saving (every 100 chunks)
- [ ] Add recovery detection on startup
- [ ] Implement resume logic
- [ ] Test crash scenarios (kill process, timeout)
- [ ] Add state cleanup

### Phase 5: Integration & Polish - 1 day

- [ ] Integrate all services
- [ ] Add comprehensive error handling
- [ ] Write integration tests
- [ ] Update documentation
- [ ] Test on all codebases (small, medium, large)

**Total Estimated Time: 6-9 days**

---

## 🎯 Success Metrics

| Metric                              | Target | Measurement                    |
| ----------------------------------- | ------ | ------------------------------ |
| **Incremental re-index (10 files)** | <10s   | Benchmark test                 |
| **File watch latency**              | <5s    | Change → Re-index complete     |
| **Git hook latency**                | <30s   | Branch switch → Re-index done  |
| **Recovery success rate**           | >95%   | Crash tests                    |
| **False positives**                 | <1%    | Don't re-index unchanged files |

---

## 🚀 Rollout Plan

### Phase 2 (Current)

- ✅ Background indexing
- ✅ Parallel processing
- ✅ Optimized configs

### Phase 2.5 (Auto Re-Index - This Design)

1. **Week 1:** Incremental re-indexing (core functionality)
2. **Week 2:** File watching + Git hooks
3. **Week 3:** Crash recovery + Polish

### Phase 3 (Future)

- Embedding cache (reuse embeddings for unchanged chunks)
- Multi-repo support
- Distributed indexing

---

## 💡 Alternative Approaches Considered

### Approach 1: Polling-Based (❌ Rejected)

- Poll for changes every N seconds
- **Problem:** Wasteful, high latency
- **Decision:** Use event-based (chokidar + git hooks)

### Approach 2: Full Re-Index on Any Change (❌ Rejected)

- Simple but slow
- **Problem:** Too expensive for large codebases
- **Decision:** Use incremental with Merkle trees

### Approach 3: Manual Re-Index Only (❌ Not Ideal)

- User triggers all re-indexes
- **Problem:** Index goes stale quickly
- **Decision:** Auto re-index with opt-in

### Approach 4: Hybrid Auto + Manual (✅ Selected)

- Auto re-index for small changes
- Prompt for large changes
- Manual override always available
- **Best balance of automation and control**

---

## 🎓 Summary

### What This Achieves

**Before (Phase 1):**

- ❌ Manual re-index only
- ❌ Index goes stale after code changes
- ❌ No recovery from crashes
- ❌ Branch switches invalidate index

**After (Auto Re-Index):**

- ✅ Auto re-index on file save (debounced)
- ✅ Auto re-index on git operations
- ✅ Resume from crashes
- ✅ Always up-to-date index
- ✅ <10s incremental updates

### Key Benefits

1. **Always Fresh:** Index stays in sync with code
2. **Fast Updates:** Incremental re-index in seconds
3. **Resilient:** Recovers from crashes
4. **Developer-Friendly:** Works with git workflow
5. **Configurable:** Opt-in/opt-out per feature

---

**Design complete! Ready to implement when you give the go-ahead.**

**Estimated implementation time: 6-9 days (can be split across multiple sessions)**

**Would you like me to start implementing now, or review/adjust the design first?**
