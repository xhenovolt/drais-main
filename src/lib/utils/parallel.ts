/**
 * Parallel Processing Utilities
 * 
 * Provides queue-based parallel processing for device sync operations.
 * Uses concurrent workers to improve throughput.
 * 
 * Phase 4: Parallel processing for multiple devices
 */

import { getConnection } from '@/lib/db';
import DeviceService from '@/lib/services/DeviceAdapterService';

/**
 * Sync job status
 */
export enum SyncJobStatus {
  PENDING = 'pending',
  RUNNING = 'running',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled'
}

/**
 * Sync job interface
 */
export interface SyncJob {
  id: string;
  device_id: number;
  status: SyncJobStatus;
  priority: number;
  started_at?: Date;
  completed_at?: Date;
  error_message?: string;
  records_processed?: number;
  created_at: Date;
}

/**
 * Worker pool for parallel sync processing
 */
export class SyncWorkerPool {
  private static instance: SyncWorkerPool;
  private jobs: Map<string, SyncJob> = new Map();
  private maxConcurrent: number;
  private running: number = 0;
  private queue: string[] = [];
  private readonly CONCURRENT_LIMIT: number;
  
  constructor(maxConcurrent: number = 5) {
    this.maxConcurrent = maxConcurrent;
    this.CONCURRENT_LIMIT = maxConcurrent;
  }
  
  /**
   * Get singleton instance
   */
  static getInstance(maxConcurrent?: number): SyncWorkerPool {
    if (!SyncWorkerPool.instance) {
      SyncWorkerPool.instance = new SyncWorkerPool(maxConcurrent);
    }
    return SyncWorkerPool.instance;
  }
  
  /**
   * Add a sync job to the queue
   */
  async addJob(deviceId: number, priority: number = 1): Promise<string> {
    const jobId = `job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const job: SyncJob = {
      id: jobId,
      device_id: deviceId,
      status: SyncJobStatus.PENDING,
      priority,
      created_at: new Date()
    };
    
    this.jobs.set(jobId, job);
    
    // Insert into queue sorted by priority
    this.insertIntoQueue(jobId, priority);
    
    // Try to process if we have capacity
    this.processNext();
    
    return jobId;
  }
  
  /**
   * Get job status
   */
  getJobStatus(jobId: string): SyncJob | undefined {
    return this.jobs.get(jobId);
  }
  
  /**
   * Get all pending jobs
   */
  getPendingJobs(): SyncJob[] {
    return Array.from(this.jobs.values())
      .filter(job => job.status === SyncJobStatus.PENDING)
      .sort((a, b) => b.priority - a.priority);
  }
  
  /**
   * Get running jobs
   */
  getRunningJobs(): SyncJob[] {
    return Array.from(this.jobs.values())
      .filter(job => job.status === SyncJobStatus.RUNNING);
  }
  
  /**
   * Get pool status
   */
  getPoolStatus(): { 
    pending: number; 
    running: number; 
    completed: number; 
    failed: number;
    maxConcurrent: number;
  } {
    const jobs = Array.from(this.jobs.values());
    return {
      pending: jobs.filter(j => j.status === SyncJobStatus.PENDING).length,
      running: jobs.filter(j => j.status === SyncJobStatus.RUNNING).length,
      completed: jobs.filter(j => j.status === SyncJobStatus.COMPLETED).length,
      failed: jobs.filter(j => j.status === SyncJobStatus.FAILED).length,
      maxConcurrent: this.maxConcurrent
    };
  }
  
  /**
   * Cancel a job
   */
  cancelJob(jobId: string): boolean {
    const job = this.jobs.get(jobId);
    if (!job) return false;
    
    if (job.status === SyncJobStatus.PENDING) {
      job.status = SyncJobStatus.CANCELLED;
      this.queue = this.queue.filter(id => id !== jobId);
      return true;
    }
    
    return false;
  }
  
  /**
   * Process next job in queue
   */
  private async processNext(): Promise<void> {
    // Check if we can start more jobs
    if (this.running >= this.maxConcurrent || this.queue.length === 0) {
      return;
    }
    
    // Get next job
    const jobId = this.queue.shift()!;
    const job = this.jobs.get(jobId);
    
    if (!job || job.status !== SyncJobStatus.PENDING) {
      this.processNext();
      return;
    }
    
    // Mark as running
    this.running++;
    job.status = SyncJobStatus.RUNNING;
    job.started_at = new Date();
    
    // Execute sync
    this.executeJob(job).finally(() => {
      this.running--;
      this.processNext();
    });
  }
  
  /**
   * Insert job into queue based on priority
   */
  private insertIntoQueue(jobId: string, priority: number): void {
    // Find position to insert based on priority (higher priority first)
    let insertIndex = 0;
    for (let i = 0; i < this.queue.length; i++) {
      const existingJob = this.jobs.get(this.queue[i]);
      if (existingJob && existingJob.priority <= priority) {
        insertIndex = i;
        break;
      }
      insertIndex = i + 1;
    }
    
    this.queue.splice(insertIndex, 0, jobId);
  }
  
  /**
   * Execute a sync job
   */
  private async executeJob(job: SyncJob): Promise<void> {
    try {
      // Sync logs from device
      const recordsProcessed = await DeviceService.syncDeviceLogs(job.device_id);
      
      // Mark as completed
      job.status = SyncJobStatus.COMPLETED;
      job.completed_at = new Date();
      job.records_processed = recordsProcessed;
      
      console.log(`Job ${job.id} completed: ${recordsProcessed} records processed`);
      
    } catch (error: any) {
      // Mark as failed
      job.status = SyncJobStatus.FAILED;
      job.completed_at = new Date();
      job.error_message = error.message;
      
      console.error(`Job ${job.id} failed:`, error);
    }
  }
}

/**
 * Batch sync manager - coordinates syncing multiple devices
 */
export class BatchSyncManager {
  /**
   * Sync all active devices in parallel
   */
  static async syncAllDevices(concurrency: number = 5): Promise<{
    successful: number;
    failed: number;
    total: number;
  }> {
    const connection = await getConnection();
    
    try {
      // Get all active devices
      const [devices] = await connection.execute(
        `SELECT id, device_type, ip_address, location 
         FROM biometric_devices 
         WHERE status = 'active'`
      );
      
      const deviceList = devices as any[];
      const total = deviceList.length;
      let successful = 0;
      let failed = 0;
      
      // Use worker pool for parallel processing
      const pool = SyncWorkerPool.getInstance(concurrency);
      
      // Add all jobs
      const jobIds = await Promise.all(
        deviceList.map(device => pool.addJob(device.id, device.priority || 1))
      );
      
      // Wait for all jobs to complete
      await this.waitForJobs(pool, jobIds);
      
      // Check results
      for (const jobId of jobIds) {
        const job = pool.getJobStatus(jobId);
        if (job?.status === SyncJobStatus.COMPLETED) {
          successful++;
        } else {
          failed++;
        }
      }
      
      return { successful, failed, total };
      
    } finally {
      await connection.end();
    }
  }
  
  /**
   * Wait for all jobs to complete
   */
  private static async waitForJobs(
    pool: SyncWorkerPool, 
    jobIds: string[],
    timeout: number = 300000
  ): Promise<void> {
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeout) {
      const status = pool.getPoolStatus();
      
      // Check if all jobs are done
      const allDone = jobIds.every(jobId => {
        const job = pool.getJobStatus(jobId);
        return job?.status === SyncJobStatus.COMPLETED || 
               job?.status === SyncJobStatus.FAILED ||
               job?.status === SyncJobStatus.CANCELLED;
      });
      
      if (allDone || (status.pending === 0 && status.running === 0)) {
        return;
      }
      
      // Wait before checking again
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    throw new Error('Batch sync timeout');
  }
  
  /**
   * Priority sync - process critical devices first
   */
  static async prioritySync(deviceIds: number[]): Promise<{
    successful: number;
    failed: number;
    total: number;
  }> {
    const pool = SyncWorkerPool.getInstance(3); // Lower concurrency for priority
    
    // Add jobs with high priority
    const jobIds = await Promise.all(
      deviceIds.map(id => pool.addJob(id, 10)) // High priority
    );
    
    // Wait for completion
    await this.waitForJobs(pool, jobIds);
    
    // Get results
    let successful = 0;
    let failed = 0;
    
    for (const jobId of jobIds) {
      const job = pool.getJobStatus(jobId);
      if (job?.status === SyncJobStatus.COMPLETED) {
        successful++;
      } else {
        failed++;
      }
    }
    
    return { successful, failed, total: deviceIds.length };
  }
}

const parallelUtils = {
  SyncWorkerPool,
  BatchSyncManager,
  SyncJobStatus
};
export default parallelUtils;
