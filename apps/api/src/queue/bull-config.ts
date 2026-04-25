/**
 * BullMQ Configuration - Production Grade
 * Features: Retry policies, Dead Letter Queue, Concurrency, Backpressure
 * @module queue/bull-config
 */

import { Queue, Worker, QueueEvents, QueueScheduler } from 'bullmq';
import { Redis } from 'ioredis';
import { logger } from '../config/logger.js';
import { env } from '../config/env.js';

// ================== REDIS CONNECTION ==================

const redisConfig = {
  host: env.REDIS_HOST,
  port: env.REDIS_PORT,
  password: env.REDIS_PASSWORD,
  maxRetriesPerRequest: null, // BullMQ requirement
  enableReadyCheck: false,
  retryStrategy: (times: number) => {
    const delay = Math.min(times * 50, 2000);
    return delay;
  },
};

export const redisConnection = new Redis(redisConfig);

redisConnection.on('error', (err) => {
  logger.error('Redis connection error', { error: err.message });
});

redisConnection.on('connect', () => {
  logger.info('✅ BullMQ Redis connected');
});

// ================== QUEUE CONFIGURATION ==================

export const QUEUE_NAMES = {
  PROJECT_GENERATION: 'project:generation',
  MCP_EXECUTION: 'mcp:execution',
  SANDBOX_POOL: 'sandbox:pool',
  COST_TRACKING: 'cost:tracking',
  DEAD_LETTER: 'dead-letter',
} as const;

export type QueueName = typeof QUEUE_NAMES[keyof typeof QUEUE_NAMES];

// ================== DEFAULT JOB OPTIONS ==================

export const defaultJobOptions = {
  attempts: 3,
  backoff: {
    type: 'exponential' as const,
    delay: 2000, // Initial delay 2s
  },
  removeOnComplete: {
    age: 3600 * 24 * 7, // Keep completed jobs 7 days
    count: 1000, // Keep max 1000 completed jobs
  },
  removeOnFail: {
    age: 3600 * 24 * 30, // Keep failed jobs 30 days
  },
};

// ================== WORKER OPTIONS ==================

export const defaultWorkerOptions = {
  connection: redisConnection,
  concurrency: 5, // Process 5 jobs in parallel
  limiter: {
    max: 10, // Max 10 jobs
    duration: 1000, // Per 1 second (rate limiting)
  },
  settings: {
    backoffStrategy: (attemptsMade: number) => {
      // Custom exponential backoff with jitter
      const base = 2000;
      const jitter = Math.random() * 1000;
      return Math.min(base * Math.pow(2, attemptsMade) + jitter, 60000);
    },
  },
};

// ================== DEAD LETTER QUEUE ==================

export class DeadLetterQueue {
  private queue: Queue;
  private events: QueueEvents;

  constructor() {
    this.queue = new Queue(QUEUE_NAMES.DEAD_LETTER, {
      connection: redisConnection,
      defaultJobOptions: {
        removeOnComplete: false,
        removeOnFail: false,
      },
    });

    this.events = new QueueEvents(QUEUE_NAMES.DEAD_LETTER, {
      connection: redisConnection,
    });

    this.setupEventListeners();
  }

  private setupEventListeners() {
    this.events.on('completed', ({ jobId }) => {
      logger.info('Dead letter job processed', { jobId });
    });
  }

  async add(
    originalQueue: string,
    jobData: any,
    error: Error,
    attemptsMade: number
  ) {
    await this.queue.add(
      'failed-job',
      {
        originalQueue,
        jobData,
        error: {
          message: error.message,
          stack: error.stack,
        },
        attemptsMade,
        timestamp: new Date().toISOString(),
      },
      {
        priority: 10, // High priority for dead letter
      }
    );

    logger.error('Job moved to dead letter queue', {
      queue: originalQueue,
      jobData,
      error: error.message,
      attempts: attemptsMade,
    });
  }

  async getFailedJobs(limit = 100) {
    return this.queue.getJobs(['failed', 'completed'], 0, limit, true);
  }

  async retryJob(jobId: string, targetQueue: string) {
    const job = await this.queue.getJob(jobId);
    if (!job) throw new Error(`Job ${jobId} not found in dead letter queue`);

    const { jobData } = job.data;

    // Re-add to original queue
    const targetQueueInstance = new Queue(targetQueue, {
      connection: redisConnection,
    });

    await targetQueueInstance.add(job.name, jobData, {
      ...defaultJobOptions,
      attempts: 1, // Fresh retry
    });

    await job.remove();

    logger.info('Job retried from dead letter queue', {
      jobId,
      targetQueue,
    });
  }

  async purge() {
    await this.queue.obliterate({ force: true });
    logger.warn('Dead letter queue purged');
  }
}

// ================== QUEUE FACTORY ==================

export class QueueFactory {
  private static queues = new Map<string, Queue>();
  private static workers = new Map<string, Worker>();
  private static events = new Map<string, QueueEvents>();
  public static deadLetterQueue = new DeadLetterQueue();

  static createQueue(name: QueueName, options = {}): Queue {
    if (this.queues.has(name)) {
      return this.queues.get(name)!;
    }

    const queue = new Queue(name, {
      connection: redisConnection,
      defaultJobOptions: {
        ...defaultJobOptions,
        ...options,
      },
    });

    this.queues.set(name, queue);

    // Setup queue events
    const queueEvents = new QueueEvents(name, {
      connection: redisConnection,
    });

    queueEvents.on('failed', async ({ jobId, failedReason, prev }) => {
      logger.error('Job failed', {
        queue: name,
        jobId,
        reason: failedReason,
        previousState: prev,
      });

      // Get job details
      const job = await queue.getJob(jobId);
      if (job && job.attemptsMade >= (job.opts.attempts || 3)) {
        // Move to dead letter queue
        await this.deadLetterQueue.add(
          name,
          job.data,
          new Error(failedReason),
          job.attemptsMade
        );
      }
    });

    queueEvents.on('completed', ({ jobId, returnvalue }) => {
      logger.info('Job completed', {
        queue: name,
        jobId,
        result: returnvalue,
      });
    });

    queueEvents.on('progress', ({ jobId, data }) => {
      logger.debug('Job progress', {
        queue: name,
        jobId,
        progress: data,
      });
    });

    this.events.set(name, queueEvents);

    logger.info(`✅ Queue created: ${name}`);
    return queue;
  }

  static createWorker(
    name: QueueName,
    processor: (job: any) => Promise<any>,
    options = {}
  ): Worker {
    if (this.workers.has(name)) {
      return this.workers.get(name)!;
    }

    const worker = new Worker(name, processor, {
      ...defaultWorkerOptions,
      ...options,
    });

    worker.on('completed', (job) => {
      logger.info('Worker completed job', {
        worker: name,
        jobId: job.id,
        duration: Date.now() - job.timestamp,
      });
    });

    worker.on('failed', (job, err) => {
      logger.error('Worker failed job', {
        worker: name,
        jobId: job?.id,
        error: err.message,
        stack: err.stack,
      });
    });

    worker.on('error', (err) => {
      logger.error('Worker error', {
        worker: name,
        error: err.message,
      });
    });

    this.workers.set(name, worker);

    logger.info(`✅ Worker created: ${name}`);
    return worker;
  }

  static async getQueueMetrics(name: QueueName) {
    const queue = this.queues.get(name);
    if (!queue) throw new Error(`Queue ${name} not found`);

    const [waiting, active, completed, failed, delayed] = await Promise.all([
      queue.getWaitingCount(),
      queue.getActiveCount(),
      queue.getCompletedCount(),
      queue.getFailedCount(),
      queue.getDelayedCount(),
    ]);

    return {
      name,
      waiting,
      active,
      completed,
      failed,
      delayed,
      total: waiting + active + delayed,
    };
  }

  static async pauseQueue(name: QueueName) {
    const queue = this.queues.get(name);
    if (!queue) throw new Error(`Queue ${name} not found`);
    await queue.pause();
    logger.warn(`Queue paused: ${name}`);
  }

  static async resumeQueue(name: QueueName) {
    const queue = this.queues.get(name);
    if (!queue) throw new Error(`Queue ${name} not found`);
    await queue.resume();
    logger.info(`Queue resumed: ${name}`);
  }

  static async closeAll() {
    logger.info('Closing all queues and workers...');

    await Promise.all([
      ...Array.from(this.queues.values()).map((q) => q.close()),
      ...Array.from(this.workers.values()).map((w) => w.close()),
      ...Array.from(this.events.values()).map((e) => e.close()),
    ]);

    await redisConnection.quit();

    logger.info('✅ All queues and workers closed');
  }
}

// ================== BACKPRESSURE MANAGEMENT ==================

export class BackpressureManager {
  private maxQueueSize = 1000;
  private maxMemoryUsage = 0.8; // 80% memory threshold

  async shouldAcceptJob(queueName: QueueName): Promise<boolean> {
    // Check queue size
    const metrics = await QueueFactory.getQueueMetrics(queueName);
    if (metrics.total >= this.maxQueueSize) {
      logger.warn('Queue size limit reached', {
        queue: queueName,
        current: metrics.total,
        limit: this.maxQueueSize,
      });
      return false;
    }

    // Check memory usage
    const memUsage = process.memoryUsage();
    const memPercent = memUsage.heapUsed / memUsage.heapTotal;

    if (memPercent >= this.maxMemoryUsage) {
      logger.warn('Memory usage threshold exceeded', {
        used: memPercent,
        threshold: this.maxMemoryUsage,
      });
      return false;
    }

    return true;
  }

  async applyBackpressure(queueName: QueueName) {
    await QueueFactory.pauseQueue(queueName);

    // Wait for queue to drain
    const checkInterval = setInterval(async () => {
      const metrics = await QueueFactory.getQueueMetrics(queueName);
      if (metrics.total < this.maxQueueSize * 0.5) {
        clearInterval(checkInterval);
        await QueueFactory.resumeQueue(queueName);
      }
    }, 5000);
  }
}

export const backpressureManager = new BackpressureManager();
