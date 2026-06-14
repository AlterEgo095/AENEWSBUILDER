/**
 * Project Generation Queue - Production Implementation
 * Handles AI-powered code generation with retry, DLQ, and monitoring
 * @module queue/project-queue
 */

import { Job } from 'bullmq';
import { createQueue, createWorker } from './bull-config.js';
import { logger } from '../config/logger.js';

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

const QUEUE_NAME = 'project-generate';

class ProjectGenerationQueue {
  private queue;

  constructor() {
    this.queue = createQueue(QUEUE_NAME);
    // Worker processing is handled by the main worker engine in workers/index.ts
    // No duplicate consumer is registered here to avoid conflicts
  }

  async addJob(data: ProjectJobData): Promise<string> {
    const job = await this.queue.add('generate', data, {
      priority: data.priority || 5,
      jobId: data.projectId,
    });

    logger.info('Project job added to queue', {
      jobId: job.id,
      projectId: data.projectId,
    });

    return job.id!;
  }

  async getJobStatus(jobId: string) {
    const job = await this.queue.getJob(jobId);
    if (!job) return null;

    const state = await job.getState();
    return {
      jobId: job.id,
      state,
      progress: job.progress,
      data: job.data,
      returnvalue: job.returnvalue,
      failedReason: job.failedReason,
      attemptsMade: job.attemptsMade,
    };
  }

  async cancelJob(jobId: string) {
    const job = await this.queue.getJob(jobId);
    if (!job) throw new Error(`Job ${jobId} not found`);
    await job.remove();
    logger.info('Job cancelled', { jobId });
  }
}

export const projectQueue = new ProjectGenerationQueue();
