/**
 * Project Generation Queue - Production Implementation
 * Handles AI-powered code generation with retry, DLQ, and monitoring
 * @module queue/project-queue
 */

import { Job } from 'bullmq';
import { QueueFactory, QUEUE_NAMES, backpressureManager } from './bull-config.js';
import { WorkerEngine } from '../workers/index.js';
import { logger } from '../config/logger.js';
import { eventStore } from '../workers/event-store.js';

export interface ProjectJobData {
  projectId: string;
  userId: string;
  prompt: string;
  options: {
    framework?: string;
    style?: string;
    complexity?: 'simple' | 'medium' | 'complex';
  };
  priority?: number;
}

export interface ProjectJobResult {
  projectId: string;
  status: 'completed' | 'failed';
  artifacts?: {
    files: string[];
    preview: string;
    deployUrl?: string;
  };
  error?: string;
  duration: number;
  cost: {
    tokens: number;
    usd: number;
  };
}

class ProjectGenerationQueue {
  private queue = QueueFactory.createQueue(QUEUE_NAMES.PROJECT_GENERATION, {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 5000,
    },
  });

  private worker = QueueFactory.createWorker(
    QUEUE_NAMES.PROJECT_GENERATION,
    this.processJob.bind(this),
    {
      concurrency: 3, // Process 3 projects in parallel
      limiter: {
        max: 5, // Max 5 jobs per second
        duration: 1000,
      },
    }
  );

  private workerEngine = new WorkerEngine();

  /**
   * Add a new project generation job
   */
  async addJob(data: ProjectJobData): Promise<string> {
    // Check backpressure
    const canAccept = await backpressureManager.shouldAcceptJob(
      QUEUE_NAMES.PROJECT_GENERATION
    );

    if (!canAccept) {
      throw new Error('Queue is under heavy load. Please try again later.');
    }

    const job = await this.queue.add('generate', data, {
      priority: data.priority || 5,
      jobId: data.projectId, // Use projectId as jobId for idempotency
    });

    logger.info('Project job added to queue', {
      jobId: job.id,
      projectId: data.projectId,
      userId: data.userId,
    });

    // Store event
    await eventStore.store({
      type: 'job.queued',
      projectId: data.projectId,
      userId: data.userId,
      data: {
        jobId: job.id,
        prompt: data.prompt,
        options: data.options,
      },
    });

    return job.id!;
  }

  /**
   * Process a project generation job
   */
  private async processJob(job: Job<ProjectJobData>): Promise<ProjectJobResult> {
    const startTime = Date.now();
    const { projectId, userId, prompt, options } = job.data;

    logger.info('Processing project job', {
      jobId: job.id,
      projectId,
      userId,
      attempt: job.attemptsMade + 1,
    });

    try {
      // Update job progress
      await job.updateProgress(10);

      // Store event
      await eventStore.store({
        type: 'job.started',
        projectId,
        userId,
        data: {
          jobId: job.id,
          attempt: job.attemptsMade + 1,
        },
      });

      // Execute project generation
      const result = await this.workerEngine.execute({
        projectId,
        userId,
        prompt,
        framework: options.framework || 'react',
        style: options.style || 'modern',
        onProgress: async (progress: number, message: string) => {
          await job.updateProgress(progress);
          await job.log(message);

          // Emit real-time event
          await eventStore.store({
            type: 'job.progress',
            projectId,
            userId,
            data: { progress, message },
          });
        },
      });

      await job.updateProgress(100);

      const duration = Date.now() - startTime;

      // Store completion event
      await eventStore.store({
        type: 'job.completed',
        projectId,
        userId,
        data: {
          jobId: job.id,
          duration,
          artifacts: result.artifacts,
          cost: result.cost,
        },
      });

      logger.info('Project job completed', {
        jobId: job.id,
        projectId,
        duration,
        cost: result.cost,
      });

      return {
        projectId,
        status: 'completed',
        artifacts: result.artifacts,
        duration,
        cost: result.cost,
      };
    } catch (error: any) {
      const duration = Date.now() - startTime;

      logger.error('Project job failed', {
        jobId: job.id,
        projectId,
        attempt: job.attemptsMade + 1,
        error: error.message,
        duration,
      });

      // Store failure event
      await eventStore.store({
        type: 'job.failed',
        projectId,
        userId,
        data: {
          jobId: job.id,
          attempt: job.attemptsMade + 1,
          error: error.message,
          duration,
        },
      });

      throw error; // Let BullMQ handle retry
    }
  }

  /**
   * Get job status
   */
  async getJobStatus(jobId: string) {
    const job = await this.queue.getJob(jobId);
    if (!job) return null;

    const state = await job.getState();
    const progress = job.progress;
    const logs = await this.queue.getJobLogs(jobId);

    return {
      jobId: job.id,
      state,
      progress,
      data: job.data,
      returnvalue: job.returnvalue,
      failedReason: job.failedReason,
      attemptsMade: job.attemptsMade,
      logs: logs.logs,
    };
  }

  /**
   * Cancel a job
   */
  async cancelJob(jobId: string) {
    const job = await this.queue.getJob(jobId);
    if (!job) throw new Error(`Job ${jobId} not found`);

    await job.remove();

    logger.info('Job cancelled', { jobId });

    await eventStore.store({
      type: 'job.cancelled',
      projectId: job.data.projectId,
      userId: job.data.userId,
      data: { jobId },
    });
  }

  /**
   * Get queue metrics
   */
  async getMetrics() {
    return QueueFactory.getQueueMetrics(QUEUE_NAMES.PROJECT_GENERATION);
  }

  /**
   * Retry a failed job from dead letter queue
   */
  async retryDeadLetterJob(jobId: string) {
    await QueueFactory.deadLetterQueue.retryJob(
      jobId,
      QUEUE_NAMES.PROJECT_GENERATION
    );
  }

  /**
   * Get failed jobs
   */
  async getFailedJobs(limit = 50) {
    return QueueFactory.deadLetterQueue.getFailedJobs(limit);
  }
}

export const projectQueue = new ProjectGenerationQueue();
