/**
 * Query expansion utilities for improving search results.
 * Expands queries with synonyms and related terms.
 */

/**
 * Code-specific synonym mappings.
 */
const CODE_SYNONYMS: Record<string, string[]> = {
  // Validation & checking
  validation: ["validate", "validator", "check", "verify", "verification"],
  validate: ["validation", "validator", "check", "verify"],
  check: ["validate", "validation", "verify", "test"],

  // Base classes & inheritance
  base: ["parent", "superclass", "abstract", "foundation"],
  parent: ["base", "superclass", "ancestor"],
  child: ["subclass", "derived", "descendant"],

  // Data operations
  create: ["add", "insert", "new", "build", "make"],
  update: ["modify", "change", "edit", "set"],
  delete: ["remove", "destroy", "drop"],
  get: ["fetch", "retrieve", "find", "query"],

  // Common patterns
  service: ["handler", "manager", "processor", "worker"],
  controller: ["handler", "router", "endpoint"],
  model: ["entity", "record", "data", "schema"],
  helper: ["util", "utility", "tool"],

  // Authentication & security
  auth: ["authentication", "authorize", "login", "signin"],
  authentication: ["auth", "login", "credential"],
  permission: ["authorization", "access", "privilege"],

  // Testing
  test: ["spec", "check", "verify", "validate"],
  mock: ["stub", "fake", "dummy", "test"],
};

/**
 * Expand query with synonyms.
 */
export function expandQuery(query: string): string[] {
  const words = query.toLowerCase().split(/\s+/);
  const expanded = new Set<string>([query]); // Always include original

  for (const word of words) {
    // Add exact word
    expanded.add(word);

    // Add synonyms if found
    if (CODE_SYNONYMS[word]) {
      for (const synonym of CODE_SYNONYMS[word]) {
        expanded.add(synonym);

        // Create variations with other words
        const otherWords = words.filter((w) => w !== word);
        if (otherWords.length > 0) {
          expanded.add([synonym, ...otherWords].join(" "));
        }
      }
    }
  }

  return Array.from(expanded);
}

/**
 * Preprocess query for better matching.
 */
export function preprocessQuery(query: string): string {
  return (
    query
      // Normalize whitespace
      .replace(/\s+/g, " ")
      .trim()
      // Expand common abbreviations
      .replace(/\bauth\b/gi, "authentication")
      .replace(/\bconfig\b/gi, "configuration")
      .replace(/\bparams?\b/gi, "parameters")
      .replace(/\bargs?\b/gi, "arguments")
      .replace(/\breq\b/gi, "request")
      .replace(/\bres\b/gi, "response")
      .replace(/\bdoc\b/gi, "document")
      .replace(/\bdb\b/gi, "database")
      .replace(/\bapi\b/gi, "interface")
  );
}

/**
 * Generate search variations for fallback.
 */
export function generateSearchVariations(query: string): string[] {
  const processed = preprocessQuery(query);
  const variations = [
    query, // Original
    processed, // Preprocessed
    ...expandQuery(processed), // Expanded with synonyms
  ];

  // Remove duplicates
  return Array.from(new Set(variations));
}
