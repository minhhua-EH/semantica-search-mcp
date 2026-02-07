/**
 * MCP tool definitions for semantic code search.
 */

/**
 * Tool: index_codebase
 * Index a codebase for semantic search.
 */
export const INDEX_CODEBASE_TOOL = {
  name: "index_codebase",
  description:
    "Index a codebase for semantic code search. Runs in BACKGROUND by default - returns immediately and you can check progress with get_index_status. Extracts functions, classes, and modules, generates embeddings, and stores in vector database.",
  inputSchema: {
    type: "object",
    properties: {
      path: {
        type: "string",
        description: "Path to the codebase root directory",
      },
      background: {
        type: "boolean",
        description:
          "Run in background (default: true). Allows checking status while indexing. Set false to wait for completion.",
        default: true,
      },
      languages: {
        type: "array",
        items: {
          type: "string",
          enum: ["typescript", "ruby", "javascript", "python", "go", "java"],
        },
        description:
          "Languages to index (optional, auto-detects if not specified)",
      },
    },
    required: ["path"],
  },
};

/**
 * Tool: search_code
 * Search indexed codebase semantically.
 */
export const SEARCH_CODE_TOOL = {
  name: "search_code",
  description:
    "Search the indexed codebase semantically using natural language. Returns relevant code chunks with similarity scores.",
  inputSchema: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description:
          'Natural language search query (e.g., "find authentication logic")',
      },
      maxResults: {
        type: "number",
        description: "Maximum number of results to return (default: 10)",
        minimum: 1,
        maximum: 50,
      },
      minScore: {
        type: "number",
        description: "Minimum similarity score 0-1 (default: 0.7)",
        minimum: 0,
        maximum: 1,
      },
      language: {
        type: "string",
        description: "Filter by programming language",
        enum: ["typescript", "ruby", "javascript", "python", "go", "java"],
      },
      pathPattern: {
        type: "string",
        description: "Filter by file path pattern (regex)",
      },
    },
    required: ["query"],
  },
};

/**
 * Tool: get_index_status
 * Get status of the indexed codebase.
 */
export const GET_INDEX_STATUS_TOOL = {
  name: "get_index_status",
  description:
    "Get the current status of the indexed codebase. Shows LIVE PROGRESS if indexing is running in background, or collection statistics if idle. Use this to monitor long-running indexing jobs.",
  inputSchema: {
    type: "object",
    properties: {},
  },
};

/**
 * Tool: clear_index
 * Clear all indexed data.
 */
export const CLEAR_INDEX_TOOL = {
  name: "clear_index",
  description:
    "Clear all indexed data from the vector database. This will delete the collection and all vectors.",
  inputSchema: {
    type: "object",
    properties: {
      confirm: {
        type: "boolean",
        description: "Confirmation to clear index (must be true)",
      },
    },
    required: ["confirm"],
  },
};

/**
 * Tool: reindex_changed_files
 * Incrementally re-index changed files only.
 */
export const REINDEX_CHANGED_TOOL = {
  name: "reindex_changed_files",
  description:
    "Incrementally re-index only changed files (fast). Uses Merkle trees to auto-detect changes, or re-indexes specific files if provided. Much faster than full re-index.",
  inputSchema: {
    type: "object",
    properties: {
      path: {
        type: "string",
        description: "Path to codebase root directory",
      },
      files: {
        type: "array",
        items: { type: "string" },
        description:
          "Specific files to re-index (optional, auto-detects if not provided)",
      },
    },
    required: ["path"],
  },
};

/**
 * Tool: enable_git_hooks
 * Install git hooks for automatic re-indexing.
 */
export const ENABLE_GIT_HOOKS_TOOL = {
  name: "enable_git_hooks",
  description:
    "Install git hooks for automatic re-indexing on git operations (branch switch, pull, merge). Makes index stay in sync automatically.",
  inputSchema: {
    type: "object",
    properties: {
      path: {
        type: "string",
        description: "Path to codebase root directory",
      },
      hooks: {
        type: "array",
        items: {
          type: "string",
          enum: ["post-checkout", "post-merge", "post-commit"],
        },
        description: "Git hooks to install (default: all)",
      },
    },
    required: ["path"],
  },
};

/**
 * Tool: onboard_project
 * One-command setup for new projects.
 */
export const ONBOARD_PROJECT_TOOL = {
  name: "onboard_project",
  description:
    "Complete onboarding for a new project: auto-detect language, create optimized config, install git hooks, and start initial indexing. One command to set everything up!",
  inputSchema: {
    type: "object",
    properties: {
      path: {
        type: "string",
        description: "Path to project root directory",
      },
      enableGitHooks: {
        type: "boolean",
        description:
          "Install git hooks for automatic re-indexing (default: true)",
        default: true,
      },
    },
    required: ["path"],
  },
};

/**
 * Tool: reset_state
 * Fix stuck processes and clean up state.
 */
export const RESET_STATE_TOOL = {
  name: "reset_state",
  description:
    "Emergency reset: kills stuck re-index processes, removes stale locks, cleans up state files. Use this to fix issues like stuck indexing, lock conflicts, or corrupted state.",
  inputSchema: {
    type: "object",
    properties: {
      path: {
        type: "string",
        description: "Path to project root directory",
      },
    },
    required: ["path"],
  },
};

/**
 * All available tools.
 */
export const TOOLS = [
  ONBOARD_PROJECT_TOOL,
  INDEX_CODEBASE_TOOL,
  SEARCH_CODE_TOOL,
  GET_INDEX_STATUS_TOOL,
  REINDEX_CHANGED_TOOL,
  ENABLE_GIT_HOOKS_TOOL,
  RESET_STATE_TOOL,
  CLEAR_INDEX_TOOL,
];
