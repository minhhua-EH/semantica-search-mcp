/**
 * Lock file utilities for preventing concurrent operations.
 */

import { existsSync, writeFileSync, readFileSync, unlinkSync } from "fs";
import { join } from "path";

/**
 * Lock information.
 */
interface LockInfo {
  pid: number;
  operation: string;
  timestamp: number;
  projectRoot: string;
}

/**
 * Lock file manager.
 */
export class LockManager {
  private lockPath: string;

  constructor(projectRoot: string) {
    this.lockPath = join(projectRoot, ".semantica", ".indexing.lock");
  }

  /**
   * Acquire lock. Returns true if successful, false if already locked.
   */
  acquire(operation: string = "indexing"): boolean {
    // Check if lock exists
    if (existsSync(this.lockPath)) {
      const lock = this.readLock();

      if (lock) {
        // Check if process is still running
        if (this.isProcessRunning(lock.pid)) {
          // Lock is active
          return false;
        } else {
          // Stale lock, remove it
          this.release();
        }
      }
    }

    // Create new lock
    const lockInfo: LockInfo = {
      pid: process.pid,
      operation,
      timestamp: Date.now(),
      projectRoot: process.cwd(),
    };

    writeFileSync(this.lockPath, JSON.stringify(lockInfo, null, 2));
    return true;
  }

  /**
   * Release lock.
   */
  release(): void {
    if (existsSync(this.lockPath)) {
      unlinkSync(this.lockPath);
    }
  }

  /**
   * Check if locked.
   */
  isLocked(): boolean {
    if (!existsSync(this.lockPath)) {
      return false;
    }

    const lock = this.readLock();
    if (!lock) return false;

    // Check if process still running
    return this.isProcessRunning(lock.pid);
  }

  /**
   * Get lock info.
   */
  getLockInfo(): LockInfo | null {
    return this.readLock();
  }

  /**
   * Kill locked process (for branch switches).
   */
  killLockedProcess(): boolean {
    const lock = this.readLock();
    if (!lock) return false;

    try {
      process.kill(lock.pid, "SIGTERM");
      console.error(`[LOCK] Killed previous indexing process (PID: ${lock.pid})`);
      this.release();
      return true;
    } catch (error) {
      // Process doesn't exist or can't be killed
      this.release();
      return false;
    }
  }

  /**
   * Read lock file.
   */
  private readLock(): LockInfo | null {
    try {
      const data = readFileSync(this.lockPath, "utf-8");
      return JSON.parse(data);
    } catch (error) {
      return null;
    }
  }

  /**
   * Check if process is running.
   */
  private isProcessRunning(pid: number): boolean {
    try {
      // Signal 0 checks if process exists without killing it
      process.kill(pid, 0);
      return true;
    } catch (error) {
      return false;
    }
  }
}
