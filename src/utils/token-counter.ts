/**
 * Token counting utilities for estimating chunk sizes.
 * Uses simple approximation based on whitespace and punctuation.
 */

/**
 * Count tokens in a text using simple approximation.
 *
 * This is a rough approximation based on:
 * - Splitting by whitespace
 * - Counting punctuation
 * - Adding overhead for code syntax
 *
 * For more accurate counting, could integrate with tiktoken or similar.
 */
export function countTokens(text: string): number {
  if (!text || text.length === 0) {
    return 0;
  }

  // Split by whitespace
  const words = text.split(/\s+/).filter((w) => w.length > 0);

  // Count punctuation (each counts as a token)
  const punctuation = (text.match(/[.,;:!?(){}[\]<>]/g) || []).length;

  // Add overhead for code-specific tokens (operators, brackets, etc.)
  const operators = (text.match(/[=+\-*/%&|^~<>]/g) || []).length;

  // Approximate: words + punctuation + operators / 2
  return words.length + punctuation + Math.floor(operators / 2);
}

/**
 * Count tokens in multiple texts.
 */
export function countTokensBatch(texts: string[]): number {
  return texts.reduce((total, text) => total + countTokens(text), 0);
}

/**
 * Check if text exceeds token limit.
 */
export function exceedsTokenLimit(text: string, limit: number): boolean {
  return countTokens(text) > limit;
}

/**
 * Truncate text to fit within token limit.
 */
export function truncateToTokenLimit(text: string, limit: number): string {
  const tokens = countTokens(text);

  if (tokens <= limit) {
    return text;
  }

  // Rough approximation: truncate by character count
  const ratio = limit / tokens;
  const targetLength = Math.floor(text.length * ratio);

  return text.substring(0, targetLength);
}

/**
 * Split text into chunks respecting token limit.
 */
export function splitByTokens(
  text: string,
  maxTokens: number,
  overlap: number = 0,
): string[] {
  const lines = text.split("\n");
  const chunks: string[] = [];
  let currentChunk: string[] = [];
  let currentTokens = 0;

  for (const line of lines) {
    const lineTokens = countTokens(line);

    // If adding this line exceeds limit, start new chunk
    if (currentTokens + lineTokens > maxTokens && currentChunk.length > 0) {
      chunks.push(currentChunk.join("\n"));

      // Handle overlap
      if (overlap > 0) {
        const overlapLines = currentChunk.slice(-Math.ceil(overlap / 10));
        currentChunk = overlapLines;
        currentTokens = countTokensBatch(overlapLines.map((l) => l));
      } else {
        currentChunk = [];
        currentTokens = 0;
      }
    }

    currentChunk.push(line);
    currentTokens += lineTokens;
  }

  // Add final chunk
  if (currentChunk.length > 0) {
    chunks.push(currentChunk.join("\n"));
  }

  return chunks;
}

/**
 * Estimate tokens from character count (rough approximation).
 */
export function estimateTokensFromChars(charCount: number): number {
  // Rough approximation: ~4 characters per token for code
  return Math.ceil(charCount / 4);
}

/**
 * Estimate characters from token count.
 */
export function estimateCharsFromTokens(tokenCount: number): number {
  // Rough approximation: ~4 characters per token for code
  return tokenCount * 4;
}
