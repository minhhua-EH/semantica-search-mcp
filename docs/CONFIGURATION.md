# Configuration Guide

## Configuration File Structure

Configuration is stored in `.semantica/config.json` in the project root.

## Full Configuration Schema

```json
{
  "version": "1.0.0",
  "project": {
    "name": "my-project",
    "root": "/path/to/project",
    "language": ["typescript", "ruby"]
  },

  "indexing": {
    "granularity": "hybrid",
    "chunkingStrategy": "ast-split-merge",
    "maxChunkSize": 250,
    "overlap": 50,
    "reindexStrategy": "incremental",

    "include": ["src/**/*", "lib/**/*"],
    "exclude": [
      "node_modules/**",
      "**/*.test.ts",
      "**/*.spec.rb",
      "dist/**",
      "build/**"
    ],

    "languageConfig": {
      "typescript": {
        "extensions": [".ts", ".tsx"],
        "chunkTypes": ["function", "class", "interface", "type"]
      },
      "ruby": {
        "extensions": [".rb"],
        "chunkTypes": ["def", "class", "module"]
      }
    }
  },

  "embedding": {
    "provider": "ollama",
    "model": "nomic-embed-text",
    "dimensions": 768,
    "batchSize": 32,

    "ollama": {
      "host": "http://localhost:11434",
      "timeout": 30000
    },

    "openai": {
      "apiKey": "${OPENAI_API_KEY}",
      "model": "text-embedding-3-small",
      "dimensions": 1536
    }
  },

  "vectordb": {
    "provider": "milvus",
    "collectionName": "code_chunks",

    "milvus": {
      "host": "localhost",
      "port": 19530,
      "username": "",
      "password": "",
      "secure": false,
      "indexType": "IVF_FLAT",
      "metricType": "COSINE"
    },

    "qdrant": {
      "host": "localhost",
      "port": 6333,
      "apiKey": "${QDRANT_API_KEY}",
      "https": false
    }
  },

  "search": {
    "strategy": "hybrid",
    "resultFormat": "hybrid",
    "maxResults": 10,
    "minScore": 0.7,

    "hybrid": {
      "vectorWeight": 0.7,
      "keywordWeight": 0.3
    },

    "filters": {
      "enableLanguageFilter": true,
      "enablePathFilter": true,
      "enableDateFilter": false
    }
  },

  "performance": {
    "maxFileSize": "1MB",
    "maxConcurrent": 10,
    "cacheEnabled": true,
    "cacheTTL": 3600
  },

  "merkle": {
    "enabled": true,
    "storePath": ".semantica/merkle",
    "algorithm": "sha256"
  }
}
```

## Configuration Options Reference

### Indexing Granularity

| Option     | Description                | Best For             |
| ---------- | -------------------------- | -------------------- |
| `file`     | Index entire files         | Small files, configs |
| `function` | Index individual functions | Most codebases       |
| `class`    | Index classes/modules      | OOP code             |
| `block`    | Index semantic blocks      | Fine-grained search  |
| `hybrid`   | Smart mix (default)        | General use          |
| `fixed`    | Fixed-size chunks          | Legacy/non-code      |

### Chunking Strategy

| Option            | Description                   | Performance          |
| ----------------- | ----------------------------- | -------------------- |
| `ast-split-merge` | Recursive AST-based (default) | Medium, High quality |
| `ast-extract`     | Extract specific nodes        | Fast, Good quality   |
| `sliding-window`  | Fixed-size with overlap       | Fast, Basic quality  |

### Re-indexing Strategy

| Option        | Description                    | Resource Usage |
| ------------- | ------------------------------ | -------------- |
| `manual`      | User-triggered only            | Minimal        |
| `watch`       | File watcher based             | Medium         |
| `incremental` | Merkle tree tracking (default) | Low            |
| `scheduled`   | Cron-like scheduling           | Configurable   |

### Search Strategy

| Option     | Description            | Speed     |
| ---------- | ---------------------- | --------- |
| `semantic` | Pure vector similarity | Fast      |
| `keyword`  | BM25 text search       | Very Fast |
| `hybrid`   | Combined (default)     | Medium    |
| `graph`    | Include dependencies   | Slow      |

### Search Result Format

| Option    | Description                  |
| --------- | ---------------------------- |
| `snippet` | 3-10 lines with context      |
| `context` | Full function/class          |
| `file`    | Whole file with highlights   |
| `hybrid`  | Smart formatting (default)   |
| `ranked`  | Multiple results with scores |

## Environment Variables

```bash
# Embedding providers
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...

# Vector DB
MILVUS_HOST=localhost
MILVUS_PORT=19530
QDRANT_API_KEY=...

# General
SEMANTICA_CONFIG_PATH=/custom/path/to/config.json
SEMANTICA_LOG_LEVEL=info
```

## CLI Configuration Commands

```bash
# Initialize with wizard
semantica init --wizard

# Set specific options
semantica config set indexing.granularity function
semantica config set embedding.provider ollama
semantica config set vectordb.provider milvus

# Get current config
semantica config get
semantica config get indexing.granularity

# Validate config
semantica config validate

# Reset to defaults
semantica config reset
```

## Default Configuration

When you run `semantica init`, a default configuration is created:

```json
{
  "version": "1.0.0",
  "indexing": {
    "granularity": "hybrid",
    "chunkingStrategy": "ast-split-merge",
    "maxChunkSize": 250,
    "reindexStrategy": "incremental"
  },
  "embedding": {
    "provider": "ollama",
    "model": "nomic-embed-text"
  },
  "vectordb": {
    "provider": "milvus",
    "collectionName": "code_chunks"
  },
  "search": {
    "strategy": "hybrid",
    "resultFormat": "hybrid",
    "maxResults": 10
  }
}
```

## Configuration Presets

### Preset: Fast Indexing

For quick setup and fast indexing:

```bash
semantica config preset fast
```

```json
{
  "indexing": {
    "granularity": "file",
    "chunkingStrategy": "sliding-window"
  },
  "search": {
    "strategy": "semantic",
    "maxResults": 5
  }
}
```

### Preset: High Quality

For best search quality (slower):

```bash
semantica config preset quality
```

```json
{
  "indexing": {
    "granularity": "function",
    "chunkingStrategy": "ast-split-merge"
  },
  "search": {
    "strategy": "hybrid",
    "maxResults": 20
  }
}
```

### Preset: Local Privacy

For complete local operation:

```bash
semantica config preset local
```

```json
{
  "embedding": {
    "provider": "ollama",
    "model": "nomic-embed-text"
  },
  "vectordb": {
    "provider": "milvus",
    "milvus": {
      "host": "localhost"
    }
  }
}
```

## Configuration Migration

When upgrading versions, configuration is automatically migrated:

```bash
# Check for migration needs
semantica config check-migration

# Perform migration
semantica config migrate --from 1.0.0 --to 2.0.0

# Backup before migration
semantica config backup --output config.backup.json
```
