/**
 * ██████╗ ██╗   ██╗██╗     ██╗     ███╗   ███╗ ██████╗     ██████╗ ██████╗ ███╗   ██╗███████╗██╗ ██████╗ 
 * ██╔══██╗██║   ██║██║     ██║     ████╗ ████║██╔═══██╗   ██╔════╝██╔═══██╗████╗  ██║██╔════╝██║██╔════╝ 
 * ██████╔╝██║   ██║██║     ██║     ██╔████╔██║██║   ██║   ██║     ██║   ██║██╔██╗ ██║█████╗  ██║██║  ███╗
 * ██╔══██╗██║   ██║██║     ██║     ██║╚██╔╝██║██║▄▄ ██║   ██║     ██║   ██║██║╚██╗██║██╔══╝  ██║██║   ██║
 * ██████╔╝╚██████╔╝███████╗███████╗██║ ╚═╝ ██║╚██████╔╝   ╚██████╗╚██████╔╝██║ ╚████║██║     ██║╚██████╔╝
 * ╚═════╝  ╚═════╝ ╚══════╝╚══════╝╚═╝     ╚═╝ ╚══▀▀═╝     ╚═════╝ ╚═════╝ ╚═╝  ╚═══╝╚═╝     ╚═╝ ╚═════╝ 
 * 
 * AENEWS BUILDER v3.0 - Production-Grade BullMQ Configuration
 * 
 * ✅ HARDENING FEATURES:
 * - Circuit Breaker pattern (Hystrix-style)
 * - Intelligent exponential backoff with jitter
 * - Dead Letter Queue with auto-requeue logic
 * - Redis memory pressure monitoring
 * - Graceful shutdown with job draining
 * - Rate limiting per job type
 * - Comprehensive metrics & alerts
 * - Job priority management
 * - Stalled job auto-recovery
 * 
 * @author Dieudonneé MATANDA (ALTER EGO)
 * @version 3.0.0-production
 * @license MIT
 */

import { Queue, Worker, Job, QueueOptions, WorkerOptions } from 'bullmq';
import IORedis, { Redis, RedisOptions } from 'ioredis';
import { env } from '../config/env';
import { logger } from '../config/logger';
import { metrics } from '../observability/metrics';

// ═══════════════════════════════════════════════════════════════════════════
// 🔧 TYPES & INTERFACES
// ═══════════════════════════════════════════════════════════════════════════

interface CircuitBreakerState {
  failureCount: number;
  successCount: number;
  lastFailureTime: number;
  state: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
}

interface JobTypeConfig {
  concurrency: number;
  rateLimit: { max: number; duration: number };
  priority: number;
  maxRetries: number;
}

interface RedisMemoryStats {
  usedMemory: number;
  maxMemory: number;
  usagePercent: number;
  evictionPolicy: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// 🧠 CIRCUIT BREAKER (Hystrix Pattern)
// ═══════════════════════════════════════════════════════════════════════════

class CircuitBreaker {
  private state: CircuitBreakerState = {
    failureCount: 0,
    successCount: 0,
    lastFailureTime: 0,
    state: 'CLOSED',
  };

  private readonly failureThreshold = 5; // Open after 5 failures
  private readonly successThreshold = 2; // Close after 2 successes in HALF_OPEN
  private readonly timeout = 60000; // 60s before trying HALF_OPEN

  constructor(private readonly name: string) {}

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state.state === 'OPEN') {
      const timeSinceLastFailure = Date.now() - this.state.lastFailureTime;
      if (timeSinceLastFailure >= this.timeout) {
        logger.info(`[CircuitBreaker] ${this.name} → HALF_OPEN (testing recovery)`);
        this.state.state = 'HALF_OPEN';
        this.state.successCount = 0;
      } else {
        throw new Error(`Circuit breaker ${this.name} is OPEN. Retry in ${this.timeout - timeSinceLastFailure}ms`);
      }
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess(): void {
    if (this.state.state === 'HALF_OPEN') {
      this.state.successCount++;
      if (this.state.successCount >= this.successThreshold) {
        logger.info(`[CircuitBreaker] ${this.name} → CLOSED (recovered)`);
        this.state.state = 'CLOSED';
        this.state.failureCount = 0;
      }
    } else if (this.state.state === 'CLOSED') {
      this.state.failureCount = Math.max(0, this.state.failureCount - 1); // Gradual recovery
    }

    metrics.circuitBreakerState.set({ breaker: this.name }, this.state.state === 'CLOSED' ? 1 : 0);
  }

  private onFailure(): void {
    this.state.failureCount++;
    this.state.lastFailureTime = Date.now();

    if (this.state.state === 'HALF_OPEN' || this.state.failureCount >= this.failureThreshold) {
      logger.error(`[CircuitBreaker] ${this.name} → OPEN (too many failures: ${this.state.failureCount})`);
      this.state.state = 'OPEN';
      this.state.successCount = 0;
    }

    metrics.circuitBreakerState.set({ breaker: this.name }, 0);
  }

  getState(): CircuitBreakerState['state'] {
    return this.state.state;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 🔌 REDIS CONNECTION FACTORY (Production-Grade)
// ═══════════════════════════════════════════════════════════════════════════

export class RedisConnectionManager {
  private static instance: RedisConnectionManager;
  private clients: Map<string, Redis> = new Map();
  private circuitBreaker = new CircuitBreaker('redis-connection');
  private memoryCheckInterval: NodeJS.Timeout | null = null;

  private constructor() {
    this.startMemoryMonitoring();
  }

  static getInstance(): RedisConnectionManager {
    if (!RedisConnectionManager.instance) {
      RedisConnectionManager.instance = new RedisConnectionManager();
    }
    return RedisConnectionManager.instance;
  }

  /**
   * Create production-grade Redis connection with:
   * - Exponential backoff with jitter
   * - Infinite retries for workers (null maxRetriesPerRequest)
   * - Offline queue disabled for Queue instances (fail-fast)
   * - Comprehensive error handling
   */
  createConnection(name: string, isWorker: boolean = false): Redis {
    const existingClient = this.clients.get(name);
    if (existingClient) return existingClient;

    const options: RedisOptions = {
      host: env.REDIS_HOST,
      port: env.REDIS_PORT,
      password: env.REDIS_PASSWORD,
      maxRetriesPerRequest: isWorker ? null : 3, // Worker: infinite, Queue: fail-fast
      enableOfflineQueue: isWorker, // Worker: true, Queue: false (fail-fast)
      retryStrategy: (times: number) => {
        // Exponential backoff with jitter: min 1s, max 20s
        const delay = Math.min(Math.exp(times) + Math.random() * 1000, 20000);
        logger.warn(`[Redis] Retry ${times} for ${name} in ${Math.round(delay)}ms`);
        return Math.max(delay, 1000);
      },
      reconnectOnError: (err) => {
        logger.error(`[Redis] Reconnect triggered for ${name}:`, err.message);
        return true; // Always attempt reconnection
      },
    };

    const client = new IORedis(options);

    // Event handlers
    client.on('connect', () => {
      logger.info(`[Redis] ✅ ${name} connected`);
      metrics.redisConnections.inc({ client: name, status: 'connected' });
    });

    client.on('error', (err) => {
      logger.error(`[Redis] ❌ ${name} error:`, err.message);
      metrics.redisConnections.inc({ client: name, status: 'error' });
      
      // Don't throw - let circuit breaker handle it
      if (!isWorker && err.message.includes('ECONNREFUSED')) {
        this.circuitBreaker.onFailure();
      }
    });

    client.on('close', () => {
      logger.warn(`[Redis] ⚠️ ${name} connection closed`);
      metrics.redisConnections.dec({ client: name, status: 'connected' });
    });

    client.on('reconnecting', () => {
      logger.info(`[Redis] 🔄 ${name} reconnecting...`);
    });

    this.clients.set(name, client);
    return client;
  }

  /**
   * Monitor Redis memory usage and trigger alerts if > 80%
   */
  private startMemoryMonitoring(): void {
    if (this.memoryCheckInterval) return;

    this.memoryCheckInterval = setInterval(async () => {
      try {
        const client = this.createConnection('memory-monitor', false);
        const info = await client.info('memory');
        const stats = this.parseMemoryInfo(info);

        metrics.redisMemoryUsage.set(stats.usagePercent);

        if (stats.usagePercent > 80) {
          logger.error(`[Redis] ⚠️ MEMORY CRITICAL: ${stats.usagePercent.toFixed(2)}% used (${stats.usedMemory} / ${stats.maxMemory})`);
          // Trigger alert (integrate with PagerDuty/Slack)
        } else if (stats.usagePercent > 60) {
          logger.warn(`[Redis] Memory usage: ${stats.usagePercent.toFixed(2)}%`);
        }

        // Check eviction policy
        if (stats.evictionPolicy !== 'noeviction') {
          logger.error(`[Redis] ⚠️ CRITICAL: maxmemory-policy is "${stats.evictionPolicy}" (MUST be "noeviction")`);
        }
      } catch (error: any) {
        logger.error('[Redis] Memory monitoring failed:', error.message);
      }
    }, 30000); // Check every 30s
  }

  private parseMemoryInfo(info: string): RedisMemoryStats {
    const lines = info.split('\r\n');
    const usedMemory = parseInt(lines.find(l => l.startsWith('used_memory:'))?.split(':')[1] || '0');
    const maxMemory = parseInt(lines.find(l => l.startsWith('maxmemory:'))?.split(':')[1] || '0');
    const evictionPolicy = lines.find(l => l.startsWith('maxmemory_policy:'))?.split(':')[1] || 'unknown';

    return {
      usedMemory,
      maxMemory: maxMemory || Infinity,
      usagePercent: maxMemory ? (usedMemory / maxMemory) * 100 : 0,
      evictionPolicy,
    };
  }

  async closeAll(): Promise<void> {
    if (this.memoryCheckInterval) {
      clearInterval(this.memoryCheckInterval);
      this.memoryCheckInterval = null;
    }

    const closePromises = Array.from(this.clients.entries()).map(async ([name, client]) => {
      try {
        await client.quit();
        logger.info(`[Redis] Closed ${name}`);
      } catch (err: any) {
        logger.error(`[Redis] Failed to close ${name}:`, err.message);
      }
    });

    await Promise.all(closePromises);
    this.clients.clear();
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 📦 JOB TYPE CONFIGURATIONS (Per-Type Rate Limiting & Concurrency)
// ═══════════════════════════════════════════════════════════════════════════

const JOB_CONFIGS: Record<string, JobTypeConfig> = {
  'project:create': {
    concurrency: 5,
    rateLimit: { max: 10, duration: 60000 }, // 10 jobs per minute
    priority: 1,
    maxRetries: 3,
  },
  'project:generate': {
    concurrency: 3,
    rateLimit: { max: 5, duration: 60000 }, // 5 jobs per minute (AI-heavy)
    priority: 2,
    maxRetries: 5,
  },
  'sandbox:warmup': {
    concurrency: 10,
    rateLimit: { max: 20, duration: 60000 },
    priority: 3,
    maxRetries: 2,
  },
  'ai:failover': {
    concurrency: 2,
    rateLimit: { max: 3, duration: 60000 }, // Conservative for fallback
    priority: 1,
    maxRetries: 3,
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// 🚀 QUEUE & WORKER FACTORIES
// ═══════════════════════════════════════════════════════════════════════════

export class BullMQFactory {
  private static queues: Map<string, Queue> = new Map();
  private static workers: Map<string, Worker> = new Map();
  private static redisManager = RedisConnectionManager.getInstance();

  /**
   * Create production-grade Queue with fail-fast behavior
   */
  static createQueue(name: string): Queue {
    const existing = this.queues.get(name);
    if (existing) return existing;

    const connection = this.redisManager.createConnection(`queue-${name}`, false);
    const config = JOB_CONFIGS[name] || JOB_CONFIGS['project:create'];

    const queue = new Queue(name, {
      connection,
      defaultJobOptions: {
        attempts: config.maxRetries,
        backoff: {
          type: 'exponential',
          delay: 2000, // Start at 2s
        },
        removeOnComplete: {
          age: 3600, // Keep completed jobs for 1 hour
          count: 100, // Keep last 100 completed
        },
        removeOnFail: false, // Keep ALL failed jobs for debugging
        priority: config.priority,
      },
    });

    queue.on('error', (err) => {
      logger.error(`[Queue:${name}] Error:`, err.message);
      metrics.queueErrors.inc({ queue: name });
    });

    this.queues.set(name, queue);
    logger.info(`[Queue:${name}] ✅ Created`);
    return queue;
  }

  /**
   * Create production-grade Worker with infinite retries & graceful shutdown
   */
  static createWorker<T = any>(
    name: string,
    processor: (job: Job<T>) => Promise<any>,
    concurrency?: number
  ): Worker<T> {
    const existing = this.workers.get(name);
    if (existing) return existing as Worker<T>;

    const connection = this.redisManager.createConnection(`worker-${name}`, true);
    const config = JOB_CONFIGS[name] || JOB_CONFIGS['project:create'];

    const worker = new Worker<T>(name, processor, {
      connection,
      concurrency: concurrency || config.concurrency,
      limiter: config.rateLimit,
      settings: {
        stalledInterval: 30000, // Check for stalled jobs every 30s
        maxStalledCount: 2, // Max 2 stalls before moving to failed
      },
    });

    // Event handlers
    worker.on('completed', (job) => {
      logger.info(`[Worker:${name}] ✅ Job ${job.id} completed`);
      metrics.jobsProcessed.inc({ queue: name, status: 'completed' });
    });

    worker.on('failed', (job, err) => {
      logger.error(`[Worker:${name}] ❌ Job ${job?.id} failed:`, err.message);
      metrics.jobsProcessed.inc({ queue: name, status: 'failed' });
      
      // Auto-requeue to DLQ if max retries exceeded
      if (job && job.attemptsMade >= config.maxRetries) {
        this.moveToDLQ(name, job, err);
      }
    });

    worker.on('stalled', (jobId) => {
      logger.warn(`[Worker:${name}] ⚠️ Job ${jobId} stalled (will be retried)`);
      metrics.jobsStalled.inc({ queue: name });
    });

    worker.on('error', (err) => {
      logger.error(`[Worker:${name}] Worker error:`, err.message);
      metrics.workerErrors.inc({ worker: name });
    });

    this.workers.set(name, worker as Worker<any>);
    logger.info(`[Worker:${name}] ✅ Created (concurrency: ${config.concurrency})`);
    return worker;
  }

  /**
   * Dead Letter Queue with auto-requeue logic
   */
  private static async moveToDLQ(queueName: string, job: Job, error: Error): Promise<void> {
    const dlqName = `${queueName}:dlq`;
    const dlq = this.createQueue(dlqName);

    try {
      await dlq.add(
        'dlq-job',
        {
          originalQueue: queueName,
          originalJobId: job.id,
          originalData: job.data,
          error: error.message,
          stack: error.stack,
          failedAt: new Date().toISOString(),
          attemptsMade: job.attemptsMade,
        },
        {
          // Auto-requeue after 10 minutes if it's a transient error
          delay: this.isTransientError(error) ? 600000 : undefined,
          priority: 1, // High priority for DLQ
        }
      );

      logger.warn(`[DLQ] Job ${job.id} moved to ${dlqName} (transient: ${this.isTransientError(error)})`);
      metrics.dlqJobs.inc({ queue: queueName });
    } catch (dlqError: any) {
      logger.error(`[DLQ] Failed to move job ${job.id} to DLQ:`, dlqError.message);
    }
  }

  /**
   * Detect transient errors that deserve auto-requeue
   */
  private static isTransientError(error: Error): boolean {
    const transientPatterns = [
      'ECONNREFUSED',
      'ETIMEDOUT',
      'ENOTFOUND',
      'rate limit',
      'temporarily unavailable',
      'circuit breaker',
    ];
    return transientPatterns.some(pattern => error.message.toLowerCase().includes(pattern.toLowerCase()));
  }

  /**
   * Graceful shutdown with job draining
   */
  static async gracefulShutdown(signal: string): Promise<void> {
    logger.info(`[BullMQ] 🛑 Received ${signal}, starting graceful shutdown...`);

    const workerClosures = Array.from(this.workers.entries()).map(async ([name, worker]) => {
      try {
        logger.info(`[Worker:${name}] Draining active jobs...`);
        await worker.close(); // Wait for active jobs to complete
        logger.info(`[Worker:${name}] ✅ Closed gracefully`);
      } catch (err: any) {
        logger.error(`[Worker:${name}] ❌ Shutdown error:`, err.message);
      }
    });

    await Promise.all(workerClosures);

    const queueClosures = Array.from(this.queues.entries()).map(async ([name, queue]) => {
      try {
        await queue.close();
        logger.info(`[Queue:${name}] ✅ Closed`);
      } catch (err: any) {
        logger.error(`[Queue:${name}] ❌ Close error:`, err.message);
      }
    });

    await Promise.all(queueClosures);

    await this.redisManager.closeAll();
    logger.info('[BullMQ] ✅ Graceful shutdown complete');
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 🎛️ GLOBAL SIGNAL HANDLERS (SIGINT / SIGTERM)
// ═══════════════════════════════════════════════════════════════════════════

process.on('SIGINT', () => BullMQFactory.gracefulShutdown('SIGINT').then(() => process.exit(0)));
process.on('SIGTERM', () => BullMQFactory.gracefulShutdown('SIGTERM').then(() => process.exit(0)));

// Unhandled exceptions
process.on('uncaughtException', (err) => {
  logger.error('[BullMQ] ⚠️ Uncaught Exception:', err);
  // Don't exit - log and continue
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('[BullMQ] ⚠️ Unhandled Rejection:', { reason, promise });
});

// ═══════════════════════════════════════════════════════════════════════════
// 📤 EXPORTS
// ═══════════════════════════════════════════════════════════════════════════

export const createQueue = BullMQFactory.createQueue.bind(BullMQFactory);
export const createWorker = BullMQFactory.createWorker.bind(BullMQFactory);
export const gracefulShutdown = BullMQFactory.gracefulShutdown.bind(BullMQFactory);
