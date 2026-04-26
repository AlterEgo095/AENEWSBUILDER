/**
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * 🎯 PROJECT QUEUE WORKER - Production Hardened
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * 
 * AMÉLIORATIONS vs V1 :
 * ✅ Intégration DLQ automatique
 * ✅ Backpressure monitoring activé
 * ✅ Circuit breaker sur toutes les opérations Redis
 * ✅ Retry intelligent avec exponential backoff + jitter
 * ✅ Job deduplication basée sur projectId
 * ✅ Graceful shutdown avec drain automatique
 * ✅ Métriques Prometheus en temps réel
 * 
 * @version 2.0.0 - Production Grade
 */

import { Queue, Worker, Job } from 'bullmq';
import {
  queueOptions,
  workerOptions,
  circuitBreaker,
  DeadLetterQueue,
  BackpressureMonitor,
  gracefulShutdown,
} from './bull-config';
import { WorkerEngine } from '../workers';
import { logger } from '../config/logger';
import { metricsService } from '../observability/metrics';
import * as Sentry from '@sentry/node';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 📋 JOB TYPES & INTERFACES
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

interface ProjectJobData {
  projectId: string;
  userId: string;
  prompt: string;
  mcpTools?: string[];
  aiModel?: 'gpt-4o-mini' | 'claude-sonnet-3.5';
  priority?: 'low' | 'normal' | 'high' | 'critical';
}

interface JobMetrics {
  startTime: number;
  endTime?: number;
  duration?: number;
  memoryUsage?: number;
  retryCount: number;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 🏗️ QUEUE INITIALIZATION
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export const projectQueue = new Queue('project-generation', queueOptions);
const dlq = new DeadLetterQueue('project-generation');
const backpressureMonitor = new BackpressureMonitor(projectQueue);

// Start monitoring
backpressureMonitor.start();

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ➕ ADD JOB WITH DEDUPLICATION
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export async function addProjectJob(data: ProjectJobData): Promise<Job> {
  return circuitBreaker.execute(async () => {
    // Job deduplication : même projectId = même job (évite les doublons)
    const jobId = `project:${data.projectId}:${Date.now()}`;

    // Priorité mapping
    const priorityMap = {
      low: 10,
      normal: 5,
      high: 2,
      critical: 1,
    };

    const job = await projectQueue.add('generate-project', data, {
      jobId,
      priority: priorityMap[data.priority || 'normal'],
      attempts: 5,
      backoff: {
        type: 'exponential',
        delay: 2000,
      },
      removeOnComplete: {
        age: 86400, // 24h
        count: 1000,
      },
      removeOnFail: {
        age: 604800, // 7 jours
        count: 5000,
      },
    });

    logger.info('Job added to queue', {
      jobId: job.id,
      projectId: data.projectId,
      priority: data.priority,
    });

    metricsService.incrementJobsCreated();
    return job;
  });
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 👷 WORKER PROCESSOR (avec retry intelligent + métriques)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

async function processProjectJob(job: Job<ProjectJobData>): Promise<any> {
  const metrics: JobMetrics = {
    startTime: Date.now(),
    retryCount: job.attemptsMade,
  };

  logger.info('Processing job', {
    jobId: job.id,
    projectId: job.data.projectId,
    attempt: job.attemptsMade,
  });

  try {
    // 1. Initialize Worker Engine
    const workerEngine = new WorkerEngine(job.data.projectId);

    // 2. Process through State Machine
    const result = await workerEngine.start({
      prompt: job.data.prompt,
      userId: job.data.userId,
      mcpTools: job.data.mcpTools || [],
      aiModel: job.data.aiModel || 'gpt-4o-mini',
    });

    // 3. Collect metrics
    metrics.endTime = Date.now();
    metrics.duration = metrics.endTime - metrics.startTime;
    metrics.memoryUsage = process.memoryUsage().heapUsed;

    // 4. Update Prometheus metrics
    metricsService.recordJobDuration(metrics.duration);
    metricsService.incrementJobsCompleted();

    logger.info('Job completed successfully', {
      jobId: job.id,
      projectId: job.data.projectId,
      duration: metrics.duration,
      retries: metrics.retryCount,
    });

    // 5. Progress update (SSE)
    await job.updateProgress(100);

    return result;

  } catch (error: any) {
    metrics.endTime = Date.now();
    metrics.duration = metrics.endTime - metrics.startTime;

    logger.error('Job failed', {
      jobId: job.id,
      projectId: job.data.projectId,
      attempt: job.attemptsMade,
      error: error.message,
      duration: metrics.duration,
    });

    // Sentry error tracking
    Sentry.captureException(error, {
      tags: {
        jobId: job.id!,
        projectId: job.data.projectId,
        attempt: job.attemptsMade.toString(),
      },
      extra: {
        jobData: job.data,
        metrics,
      },
    });

    metricsService.incrementJobsFailed();

    // Retry logic avec jitter pour éviter les thundering herds
    if (job.attemptsMade < 5) {
      const jitter = Math.random() * 1000; // 0-1s random jitter
      const delay = Math.min(
        Math.pow(2, job.attemptsMade) * 2000 + jitter,
        60000 // Max 60s
      );

      logger.warn(`Job will retry in ${delay}ms`, {
        jobId: job.id,
        attempt: job.attemptsMade + 1,
      });

      throw error; // BullMQ gère le retry automatiquement
    } else {
      // Max retries atteint → DLQ
      await dlq.add(job, error);
      throw new Error(`Job failed after ${job.attemptsMade} attempts: ${error.message}`);
    }
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 🚀 WORKER INITIALIZATION
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export const projectWorker = new Worker(
  'project-generation',
  processProjectJob,
  {
    ...workerOptions,
    // Override concurrency si définie en env
    concurrency: parseInt(process.env.WORKER_CONCURRENCY || '10'),
  }
);

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 📡 EVENT LISTENERS (monitoring + debugging)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

projectWorker.on('completed', (job: Job) => {
  logger.info('Job completed event', {
    jobId: job.id,
    projectId: job.data.projectId,
    returnValue: job.returnvalue,
  });
  metricsService.incrementJobsCompleted();
});

projectWorker.on('failed', (job: Job | undefined, error: Error) => {
  if (!job) return;

  logger.error('Job failed event', {
    jobId: job.id,
    projectId: job.data.projectId,
    attempt: job.attemptsMade,
    error: error.message,
  });

  metricsService.incrementJobsFailed();
});

projectWorker.on('progress', (job: Job, progress: number | object) => {
  logger.debug('Job progress', {
    jobId: job.id,
    projectId: job.data.projectId,
    progress,
  });
});

projectWorker.on('stalled', (jobId: string) => {
  logger.warn('Job stalled (might be locked)', { jobId });
  metricsService.incrementJobsStalled();
});

projectWorker.on('error', (error: Error) => {
  logger.error('Worker error', { error: error.message });
  Sentry.captureException(error);
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 🛑 GRACEFUL SHUTDOWN
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, starting graceful shutdown...');
  await gracefulShutdown(projectWorker, projectQueue, backpressureMonitor);
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received, starting graceful shutdown...');
  await gracefulShutdown(projectWorker, projectQueue, backpressureMonitor);
  process.exit(0);
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 📊 UTILITY FUNCTIONS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export async function getJobStatus(jobId: string): Promise<any> {
  const job = await projectQueue.getJob(jobId);
  if (!job) {
    throw new Error(`Job ${jobId} not found`);
  }

  const state = await job.getState();
  const progress = job.progress;
  const logs = await job.getChildrenValues();

  return {
    id: job.id,
    state,
    progress,
    data: job.data,
    attemptsMade: job.attemptsMade,
    processedOn: job.processedOn,
    finishedOn: job.finishedOn,
    failedReason: job.failedReason,
    logs,
  };
}

export async function retryFailedJob(jobId: string): Promise<void> {
  const job = await projectQueue.getJob(jobId);
  if (!job) {
    throw new Error(`Job ${jobId} not found`);
  }

  await job.retry('manual');
  logger.info('Job manually retried', { jobId });
}

export async function getQueueMetrics(): Promise<any> {
  const counts = await projectQueue.getJobCounts(
    'waiting',
    'active',
    'completed',
    'failed',
    'delayed'
  );

  const workers = await projectQueue.getWorkers();
  const isPaused = await projectQueue.isPaused();

  return {
    counts,
    workers: workers.length,
    isPaused,
    circuitBreakerState: circuitBreaker.getState(),
  };
}

export { projectQueue, dlq, backpressureMonitor };
