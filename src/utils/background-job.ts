/**
 * Background job management for long-running operations.
 * Allows status checks while jobs are running.
 */

export interface JobStatus {
  id: string;
  type: "indexing" | "search";
  status: "running" | "completed" | "failed";
  progress: {
    phase: string;
    current: number;
    total: number;
    percentage: number;
  };
  result?: any;
  error?: string;
  startTime: number;
  endTime?: number;
}

/**
 * Background job manager (singleton).
 */
class BackgroundJobManager {
  private jobs: Map<string, JobStatus> = new Map();
  private currentIndexingJob: string | null = null;

  /**
   * Start a new job.
   */
  startJob(id: string, type: "indexing" | "search"): void {
    if (type === "indexing") {
      this.currentIndexingJob = id;
    }

    this.jobs.set(id, {
      id,
      type,
      status: "running",
      progress: {
        phase: "starting",
        current: 0,
        total: 0,
        percentage: 0,
      },
      startTime: Date.now(),
    });
  }

  /**
   * Update job progress.
   */
  updateProgress(
    id: string,
    phase: string,
    current: number,
    total: number,
  ): void {
    const job = this.jobs.get(id);
    if (!job) return;

    job.progress = {
      phase,
      current,
      total,
      percentage: total > 0 ? (current / total) * 100 : 0,
    };
  }

  /**
   * Complete a job.
   */
  completeJob(id: string, result: any): void {
    const job = this.jobs.get(id);
    if (!job) return;

    job.status = "completed";
    job.result = result;
    job.endTime = Date.now();

    if (id === this.currentIndexingJob) {
      this.currentIndexingJob = null;
    }
  }

  /**
   * Fail a job.
   */
  failJob(id: string, error: string): void {
    const job = this.jobs.get(id);
    if (!job) return;

    job.status = "failed";
    job.error = error;
    job.endTime = Date.now();

    if (id === this.currentIndexingJob) {
      this.currentIndexingJob = null;
    }
  }

  /**
   * Get job status.
   */
  getJob(id: string): JobStatus | undefined {
    return this.jobs.get(id);
  }

  /**
   * Get current indexing job.
   */
  getCurrentIndexingJob(): JobStatus | undefined {
    if (!this.currentIndexingJob) return undefined;
    return this.jobs.get(this.currentIndexingJob);
  }

  /**
   * Check if indexing is running.
   */
  isIndexingRunning(): boolean {
    return this.currentIndexingJob !== null;
  }

  /**
   * Get all jobs.
   */
  getAllJobs(): JobStatus[] {
    return Array.from(this.jobs.values());
  }

  /**
   * Clean up old jobs (keep last 10).
   */
  cleanup(): void {
    const jobs = Array.from(this.jobs.values())
      .sort((a, b) => b.startTime - a.startTime)
      .slice(10);

    for (const job of jobs) {
      this.jobs.delete(job.id);
    }
  }
}

// Export singleton instance
export const backgroundJobs = new BackgroundJobManager();
