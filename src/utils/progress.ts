/**
 * Progress reporting utilities.
 */

export interface ProgressStats {
  phase: string;
  current: number;
  total: number;
  percentage: number;
  startTime: number;
  elapsed: number;
  eta?: number;
  speed?: number;
}

/**
 * Progress tracker for long-running operations.
 */
export class ProgressTracker {
  private startTime: number;
  private lastUpdate: number = 0;
  private minUpdateInterval: number = 100; // Min 100ms between updates

  constructor() {
    this.startTime = Date.now();
  }

  /**
   * Calculate progress statistics.
   */
  getStats(phase: string, current: number, total: number): ProgressStats {
    const now = Date.now();
    const elapsed = now - this.startTime;
    const percentage = total > 0 ? (current / total) * 100 : 0;

    // Calculate speed (items per second)
    const speed = elapsed > 0 ? (current / elapsed) * 1000 : 0;

    // Calculate ETA (remaining time in ms)
    const remaining = total - current;
    const eta = speed > 0 ? (remaining / speed) * 1000 : undefined;

    return {
      phase,
      current,
      total,
      percentage,
      startTime: this.startTime,
      elapsed,
      eta,
      speed,
    };
  }

  /**
   * Format progress as string with percentage and ETA.
   */
  formatProgress(phase: string, current: number, total: number): string {
    const stats = this.getStats(phase, current, total);

    const pct = stats.percentage.toFixed(1);
    const speed = stats.speed ? stats.speed.toFixed(1) : "0";
    const eta = stats.eta ? this.formatDuration(stats.eta) : "?";

    return `[${phase.toUpperCase()}] ${current}/${total} (${pct}%) | ${speed} items/s | ETA: ${eta}`;
  }

  /**
   * Format duration in human-readable form.
   */
  formatDuration(ms: number): string {
    if (ms < 1000) return `${ms.toFixed(0)}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    if (ms < 3600000) return `${(ms / 60000).toFixed(1)}m`;
    return `${(ms / 3600000).toFixed(1)}h`;
  }

  /**
   * Check if we should update progress (rate limiting).
   */
  shouldUpdate(): boolean {
    const now = Date.now();
    if (now - this.lastUpdate >= this.minUpdateInterval) {
      this.lastUpdate = now;
      return true;
    }
    return false;
  }

  /**
   * Create progress bar string.
   */
  createProgressBar(
    current: number,
    total: number,
    width: number = 40,
  ): string {
    const percentage = total > 0 ? current / total : 0;
    const filled = Math.floor(percentage * width);
    const empty = width - filled;

    const bar = "█".repeat(filled) + "░".repeat(empty);
    const pct = (percentage * 100).toFixed(1);

    return `${bar} ${pct}%`;
  }
}

/**
 * Format file size in human-readable form.
 */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

/**
 * Log progress to stderr (visible in MCP mode).
 */
export function logProgress(message: string): void {
  // Use stderr so it doesn't interfere with MCP stdio protocol
  console.error(message);
}
