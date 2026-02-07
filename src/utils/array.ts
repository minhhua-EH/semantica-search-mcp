/**
 * Array utility functions.
 */

/**
 * Fisher-Yates shuffle algorithm.
 * Randomly shuffles array elements in place.
 */
export function shuffle<T>(array: T[]): T[] {
  const result = [...array]; // Create copy to avoid mutating original

  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }

  return result;
}

/**
 * Create batches from an array.
 */
export function createBatches<T>(array: T[], batchSize: number): T[][] {
  const batches: T[][] = [];

  for (let i = 0; i < array.length; i += batchSize) {
    batches.push(array.slice(i, i + batchSize));
  }

  return batches;
}

/**
 * Flatten an array of arrays.
 */
export function flatten<T>(arrays: T[][]): T[] {
  return arrays.reduce((acc, arr) => acc.concat(arr), []);
}
