/**
 * TF-IDF (Term Frequency-Inverse Document Frequency) utilities.
 * Used for better keyword extraction and weighting.
 */

/**
 * Calculate term frequency for a term in a document.
 */
export function calculateTF(term: string, document: string): number {
  const words = document.toLowerCase().split(/\s+/);
  const termCount = words.filter((w) => w === term.toLowerCase()).length;
  return termCount / words.length;
}

/**
 * Calculate inverse document frequency.
 */
export function calculateIDF(term: string, documents: string[]): number {
  const docsWithTerm = documents.filter((doc) =>
    doc.toLowerCase().includes(term.toLowerCase()),
  ).length;

  if (docsWithTerm === 0) return 0;

  return Math.log(documents.length / docsWithTerm);
}

/**
 * Calculate TF-IDF score for a term.
 */
export function calculateTFIDF(
  term: string,
  document: string,
  corpus: string[],
): number {
  const tf = calculateTF(term, document);
  const idf = calculateIDF(term, corpus);
  return tf * idf;
}

/**
 * Extract top keywords using TF-IDF.
 */
export function extractKeywordsTFIDF(
  content: string,
  corpus: string[] = [],
  topN: number = 10,
): Array<{ keyword: string; score: number }> {
  // Extract unique words
  const words = content
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2);

  const uniqueWords = Array.from(new Set(words));

  // Code-specific stop words
  const stopWords = new Set([
    "the",
    "and",
    "for",
    "are",
    "but",
    "not",
    "you",
    "all",
    "can",
    "her",
    "was",
    "one",
    "our",
    "out",
    "def",
    "end",
    "return",
    "function",
    "const",
    "let",
    "var",
    "this",
    "that",
    "with",
    "from",
    "import",
    "export",
    "class",
    "if",
    "else",
    "then",
    "do",
    "while",
    "for",
  ]);

  // Filter stop words
  const filteredWords = uniqueWords.filter((w) => !stopWords.has(w));

  // Calculate TF-IDF scores
  const scoredKeywords = filteredWords.map((word) => ({
    keyword: word,
    score:
      corpus.length > 0
        ? calculateTFIDF(word, content, corpus)
        : calculateTF(word, content), // Fallback to TF only
  }));

  // Sort by score descending and take top N
  return scoredKeywords.sort((a, b) => b.score - a.score).slice(0, topN);
}

/**
 * Extract keywords as strings (for backward compatibility).
 */
export function extractTopKeywords(
  content: string,
  corpus: string[] = [],
  topN: number = 10,
): string[] {
  return extractKeywordsTFIDF(content, corpus, topN).map((k) => k.keyword);
}

/**
 * Calculate document similarity using keyword overlap (Jaccard similarity).
 */
export function calculateKeywordSimilarity(
  keywords1: string[],
  keywords2: string[],
): number {
  const set1 = new Set(keywords1.map((k) => k.toLowerCase()));
  const set2 = new Set(keywords2.map((k) => k.toLowerCase()));

  const intersection = new Set([...set1].filter((k) => set2.has(k)));
  const union = new Set([...set1, ...set2]);

  return union.size > 0 ? intersection.size / union.size : 0;
}
