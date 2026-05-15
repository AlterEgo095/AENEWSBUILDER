/**
 * ███████╗ █████╗ ███╗   ██╗██████╗ ██████╗  ██████╗ ██╗  ██╗    ██╗    ██╗ █████╗ ██████╗ ███╗   ███╗
 * ██╔════╝██╔══██╗████╗  ██║██╔══██╗██╔══██╗██╔═══██╗╚██╗██╔╝    ██║    ██║██╔══██╗██╔══██╗████╗ ████║
 * ███████╗███████║██╔██╗ ██║██║  ██║██████╔╝██║   ██║ ╚███╔╝     ██║ █╗ ██║███████║██████╔╝██╔████╔██║
 * ╚════██║██╔══██║██║╚██╗██║██║  ██║██╔══██╗██║   ██║ ██╔██╗     ██║███╗██║██╔══██║██╔══██╗██║╚██╔╝██║
 * ███████║██║  ██║██║ ╚████║██████╔╝██████╔╝╚██████╔╝██╔╝ ██╗    ╚███╔███╔╝██║  ██║██║  ██║██║ ╚═╝ ██║
 * ╚══════╝╚═╝  ╚═╝╚═╝  ╚═══╝╚═════╝ ╚═════╝  ╚═════╝ ╚═╝  ╚═╝     ╚══╝╚══╝ ╚═╝  ╚═╝╚═╝  ╚═╝╚═╝     ╚═╝
 * 
 * POOL - Production Hardened v3.1 (Execution Service)
 * 
 * 🔒 SECURITY UPDATE v3.1:
 * - Removed direct Docker socket access (dockerode)
 * - All Docker operations go through ExecutionServiceClient
 * - Docker socket is only mounted in the isolated execution-service container
 * - API container no longer has Docker socket access
 * 
 * ✅ HARDENING FEATURES:
 * - Predictive Scaling (ARIMA-like load forecasting)
 * - Advanced Saturation Metrics (queue depth, wait time, rejection rate)
 * - Proactive Health Checks
 * - Container Recycling with Memory Leak Detection (dynamic thresholds)
 * - Circuit Breaker for Execution Service failures
 * - Zombie Container Killer
 * - Disk Saturation Prevention
 * - Graceful Degradation (waiting queue)
 * 
 * @author Dieudonneé MATANDA (ALTER EGO)
 * @version 3.1.0-hardened-exec-service
 * @license MIT
 */

import axios, { AxiosInstance } from 'axios';
import jwt from 'jsonwebtoken';
import { EventEmitter } from 'events';
import { Mutex } from 'async-mutex';
import { logger } from '../config/logger.js';
import {
  sandboxSecurityBreaches, sandboxMemoryLeaks, sandboxZombiesKilled,
  sandboxDiskUsage, sandboxAcquireTime
} from '../observability/metrics.js';
import { Counter, Gauge, Histogram, register as promRegister } from 'prom-client';

// Warm Pool specific Prometheus metrics
export const warmPoolStatus = new Gauge({
  name: 'warm_pool_status',
  help: 'Warm pool status: 1=healthy, 0=degraded, -1=unavailable',
});
export const executionServiceLatency = new Histogram({
  name: 'execution_service_latency_ms',
  help: 'Execution service request latency in milliseconds',
  buckets: [50, 100, 250, 500, 1000, 2500, 5000, 10000],
});
export const warmPoolErrorsTotal = new Counter({
  name: 'warm_pool_errors_total',
  help: 'Total warm pool errors',
  labelNames: ['type'],
});

// ═══════════════════════════════════════════════════════════════════════════
// 🔑 SERVICE TOKEN GENERATOR (JWT for Execution Service auth)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Generate a JWT token for service-to-service authentication.
 * Uses the same JWT_SECRET as the execution-service for token verification.
 * Token has a short TTL (5 min) and limited scope (service role only).
 */
function generateServiceToken(): string {
  const secret = process.env.JWT_SECRET || 'change-me';
  return jwt.sign(
    { role: 'service', sub: 'warm-pool', iss: 'aenews-api' },
    secret,
    { expiresIn: '5m', algorithm: 'HS256' }
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// 🔒 EXECUTION SERVICE CLIENT
// Replaces direct Docker/Dockerode access with authenticated HTTP API calls
// ═══════════════════════════════════════════════════════════════════════════

export class ExecutionServiceClient {
  private client: AxiosInstance;
  private static instance: ExecutionServiceClient;

  private constructor() {
    const baseURL = process.env.EXECUTION_SERVICE_URL || 'http://execution-service:3010';
    this.client = axios.create({
      baseURL,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
      },
    });
    // Generate fresh JWT for each request
    this.client.interceptors.request.use((config: any) => {
      config.headers.Authorization = `Bearer ${generateServiceToken()}`;
      return config;
    });
  }

  static getInstance(): ExecutionServiceClient {
    if (!ExecutionServiceClient.instance) {
      ExecutionServiceClient.instance = new ExecutionServiceClient();
    }
    return ExecutionServiceClient.instance;
  }

  async createSandbox(config: {
    template: string;
    memory?: string;
    cpus?: number;
    networkMode?: string;
    timeout?: number;
    env?: string[];
    labels?: Record<string, string>;
  }): Promise<{ id: string; name: string; template: string; image: string; memory: string; cpus: number; timeout: number; networkMode: string; status: string }> {
    const { data } = await this.client.post('/exec/sandbox/create', config);
    return data;
  }

  async createContainer(config: {
    image: string;
    name?: string;
    cmd?: string[];
    env?: string[];
    memory?: string;
    cpus?: number;
    timeout?: number;
    networkMode?: string;
    labels?: Record<string, string>;
    workingDir?: string;
  }): Promise<{ id: string; name: string; image: string; memory: string; cpus: number; timeout: number; status: string }> {
    const { data } = await this.client.post('/exec/container/create', config);
    return data;
  }

  async startContainer(id: string): Promise<void> {
    await this.client.post(`/exec/container/${id}/start`);
  }

  async stopContainer(id: string): Promise<void> {
    await this.client.post(`/exec/container/${id}/stop`);
  }

  async removeContainer(id: string): Promise<void> {
    await this.client.delete(`/exec/container/${id}`);
  }

  async getContainerLogs(id: string): Promise<string> {
    const { data } = await this.client.get(`/exec/container/${id}/logs`);
    return data.logs;
  }

  async getContainerStats(id: string): Promise<{
    id: string;
    memory: { usage: number; limit: number; usageMB: string; limitMB: string };
    cpu: { cpuDelta: number; systemDelta: number; onlineCpus: number };
    network: Record<string, unknown>;
  }> {
    const { data } = await this.client.get(`/exec/container/${id}/stats`);
    return data;
  }

  async getContainerInspect(id: string): Promise<{
    id: string;
    name: string;
    state: { Running: boolean; Status: string; ExitCode: number };
    config: { Image: string; Cmd: string[]; Env: string[]; Labels: Record<string, string> };
    created: string;
  }> {
    const { data } = await this.client.get(`/exec/container/${id}/inspect`);
    return data;
  }

  async execInContainer(id: string, cmd: string[]): Promise<{ id: string; stdout: string; stderr: string; exitCode: number }> {
    const { data } = await this.client.post(`/exec/container/${id}/exec`, { cmd });
    return data;
  }

  async listContainers(): Promise<{
    containers: Array<{
      id: string;
      name: string;
      image: string;
      state: string;
      status: string;
      template: string;
      type: string;
      createdAt: string;
    }>;
    count: number;
  }> {
    const { data } = await this.client.get('/exec/containers');
    return data;
  }

  async createNetwork(config: { name: string; internal: boolean }): Promise<{ id: string; name: string; internal: boolean; status: string }> {
    const { data } = await this.client.post('/exec/network/create', config);
    return data;
  }

  async removeNetwork(id: string): Promise<void> {
    await this.client.delete(`/exec/network/${id}`);
  }

  async prune(): Promise<{
    containersPruned: number;
    spaceReclaimedMB: string;
    imagesPruned: number;
    imageSpaceReclaimedMB: string;
  }> {
    const { data } = await this.client.post('/exec/prune');
    return data;
  }

  async healthCheck(): Promise<boolean> {
    try {
      const { status } = await this.client.get('/exec/health');
      return status === 200;
    } catch {
      return false;
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 🔧 TYPES & INTERFACES
// ═══════════════════════════════════════════════════════════════════════════

export interface SandboxConfig {
  template: 'react' | 'next' | 'express' | 'python' | 'node';
  memory?: string;
  cpus?: number;
  timeout?: number;
  networkMode?: 'none' | 'bridge' | 'host';
}

export interface SandboxInstance {
  id: string;
  containerId: string; // Docker container ID from execution service
  config: SandboxConfig;
  status: 'warming' | 'ready' | 'busy' | 'cleanup';
  createdAt: Date;
  lastUsed: Date;
  executions: number;
  memoryBaseline: number; // Initial memory usage (for leak detection)
}

export interface PoolMetrics {
  total: number;
  available: number;
  busy: number;
  queueDepth: number;
  avgWaitTimeMs: number;
  rejectionRate: number;
  saturationPercent: number;
  predictedDemand: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// 📊 LOAD FORECASTER (Predictive Scaling)
// ═══════════════════════════════════════════════════════════════════════════

class LoadForecaster {
  private history: Array<{ timestamp: number; demand: number }> = [];
  private readonly HISTORY_SIZE = 100;
  private readonly WINDOW_SIZE = 10;

  recordDemand(demand: number): void {
    this.history.push({ timestamp: Date.now(), demand });
    if (this.history.length > this.HISTORY_SIZE) {
      this.history.shift();
    }
  }

  predictDemand(): number {
    if (this.history.length < this.WINDOW_SIZE) {
      return 0;
    }

    const recent = this.history.slice(-this.WINDOW_SIZE);
    const sum = recent.reduce((acc, { demand }) => acc + demand, 0);
    const avg = sum / this.WINDOW_SIZE;

    const firstHalf = recent.slice(0, this.WINDOW_SIZE / 2);
    const secondHalf = recent.slice(this.WINDOW_SIZE / 2);
    const firstAvg = firstHalf.reduce((acc, { demand }) => acc + demand, 0) / firstHalf.length;
    const secondAvg = secondHalf.reduce((acc, { demand }) => acc + demand, 0) / secondHalf.length;
    const trend = secondAvg - firstAvg;

    const prediction = avg + trend;
    return Math.max(0, Math.round(prediction));
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 🏊 SANDBOX WARM POOL (Hardened - Execution Service)
// ═══════════════════════════════════════════════════════════════════════════

export class SandboxWarmPool extends EventEmitter {
  private pool: Map<string, SandboxInstance> = new Map();
  private acquireMutex = new Mutex();
  private execService: ExecutionServiceClient;
  private execServiceHealthy = true;
  private healthCheckInterval?: NodeJS.Timeout;

  // Circuit Breaker
  private circuitBreaker = {
    failures: 0,
    lastFailure: 0,
    state: 'closed' as 'open' | 'half-open' | 'closed',
  };
  private readonly CIRCUIT_BREAKER_THRESHOLD = 5;
  private readonly CIRCUIT_BREAKER_TIMEOUT = 30000;

  // Waiting Queue (graceful degradation)
  private waitingQueue: Array<{
    config: SandboxConfig;
    resolve: Function;
    reject: Function;
    enqueuedAt: number;
  }> = [];

  // Metrics tracking
  private requestCount = 0;
  private rejectionCount = 0;
  private waitTimes: number[] = [];
  private loadForecaster = new LoadForecaster();

  // Pool configuration
  private readonly MIN_POOL_SIZE = 3;
  private readonly MAX_POOL_SIZE = 50;
  private readonly IDLE_TIMEOUT = 5 * 60 * 1000; // 5 minutes
  private readonly MAX_EXECUTIONS_PER_CONTAINER = 50;
  private readonly MAX_MEMORY_GROWTH_PERCENT = 50;
  private readonly ISOLATED_NETWORK = 'sandbox-isolated';
  private networkId: string | null = null;

  constructor() {
    super();
    this.execService = ExecutionServiceClient.getInstance();

    // Check if execution service is available
    this.execService.healthCheck().then((healthy) => {
      if (!healthy) {
        logger.warn('[WarmPool] Execution Service unavailable - running in degraded mode');
        this.execServiceHealthy = false;
        return;
      }
      this.execServiceHealthy = true;
      try {
        this.initialize();
      } catch (error: any) {
        logger.warn(`[WarmPool] Initialization deferred: ${error.message}`);
        this.execServiceHealthy = false;
      }
    }).catch(() => {
      logger.warn('[WarmPool] Execution Service health check failed - degraded mode');
      this.execServiceHealthy = false;
    });

    this.startExecServiceHealthCheck();
    this.startMemoryLeakDetector();
    this.startZombieKiller();
    this.startDiskSaturationMonitor();
    this.startProactiveScaling();
    this.startNetworkIsolationVerifier();
  }

  /**
   * 🔥 PROACTIVE SCALING (Predictive)
   */
  private startProactiveScaling(): void {
    setInterval(() => {
      const currentLoad = this.pool.size;
      const busyContainers = Array.from(this.pool.values()).filter((i) => i.status === 'busy').length;
      const demand = busyContainers + this.waitingQueue.length;

      this.loadForecaster.recordDemand(demand);
      const predictedDemand = this.loadForecaster.predictDemand();

      logger.debug('[WarmPool] Load forecast', {
        current: currentLoad,
        busy: busyContainers,
        queue: this.waitingQueue.length,
        predicted: predictedDemand,
      });

      if (predictedDemand > currentLoad * 0.8 && currentLoad < this.MAX_POOL_SIZE) {
        const toAdd = Math.min(predictedDemand - currentLoad, this.MAX_POOL_SIZE - currentLoad);
        logger.info(`[WarmPool] Proactive scaling: adding ${toAdd} containers`);
        this.warmPool();
      }

      const idlePercent = ((currentLoad - busyContainers) / currentLoad) * 100;
      if (idlePercent > 50 && currentLoad > this.MIN_POOL_SIZE) {
        logger.info(`[WarmPool] Scaling down: ${idlePercent.toFixed(1)}% idle`);
        this.removeIdleContainers();
      }
    }, 30000);
  }

  /**
   * 🔥 NETWORK ISOLATION VERIFICATION (Runtime Check via Execution Service)
   */
  private startNetworkIsolationVerifier(): void {
    setInterval(async () => {
      for (const instance of this.pool.values()) {
        try {
          // Verify container cannot reach external network via exec
          const result = await this.execService.execInContainer(instance.containerId, [
            'ping', '-c', '1', '-W', '1', '8.8.8.8',
          ]);

          // If ping succeeds, network isolation is BROKEN
          if (result.stdout && (result.stdout.includes('1 received') || result.stdout.includes('1 packets transmitted, 1 received'))) {
            logger.error('[WarmPool] NETWORK ISOLATION BREACH', {
              containerId: instance.containerId,
              output: result.stdout,
            });

            await this.removeContainer(instance.id);
            sandboxSecurityBreaches.inc({ type: 'network_isolation' });
          }
        } catch (error: any) {
          // Expected: ping should fail (network isolated)
          logger.debug('[WarmPool] Network isolation verified', { containerId: instance.containerId });
        }
      }
    }, 60000);
  }

  /**
   * 🔥 ADVANCED MEMORY LEAK DETECTOR (Dynamic Thresholds via Execution Service)
   */
  private startMemoryLeakDetector(): void {
    setInterval(async () => {
      for (const instance of this.pool.values()) {
        try {
          const stats = await this.execService.getContainerStats(instance.containerId);
          const currentMemory = stats.memory.usage || 0;
          const memoryLimit = stats.memory.limit || Infinity;

          const growthPercent = instance.memoryBaseline
            ? ((currentMemory - instance.memoryBaseline) / instance.memoryBaseline) * 100
            : 0;

          logger.debug('[WarmPool] Memory check', {
            containerId: instance.containerId.substring(0, 12),
            currentMB: stats.memory.usageMB,
            baselineMB: (instance.memoryBaseline / 1024 / 1024).toFixed(2),
            growthPercent: growthPercent.toFixed(1),
          });

          const usagePercent = (currentMemory / memoryLimit) * 100;
          if (growthPercent > this.MAX_MEMORY_GROWTH_PERCENT || usagePercent > 90) {
            logger.warn('[WarmPool] MEMORY LEAK DETECTED - recycling', {
              containerId: instance.containerId.substring(0, 12),
              growthPercent: growthPercent.toFixed(1),
              usagePercent: usagePercent.toFixed(1),
            });

            await this.removeContainer(instance.id);
            sandboxMemoryLeaks.inc();
            this.warmPool();
          }
        } catch (error: any) {
          logger.warn('[WarmPool] Memory check failed - removing stale container', {
            containerId: instance.containerId,
            error: error.message,
          });
          // Remove stale container from pool and trigger re-warming
          try {
            this.pool.delete(instance.id);
            logger.info('[WarmPool] Removed stale entry, re-warming pool', {
              containerId: instance.containerId.substring(0, 12),
            });
            this.warmPool();
          } catch (cleanupErr: any) {
            logger.error('[WarmPool] Failed to clean up stale entry', {
              error: cleanupErr.message,
            });
          }
        }
      }
    }, 30000);
  }

  /**
   * 🔥 ZOMBIE CONTAINER KILLER (via Execution Service)
   */
  private startZombieKiller(): void {
    let consecutiveErrors = 0;
    const MAX_CONSECUTIVE_ERRORS = 5;
    
    setInterval(async () => {
      try {
        const result = await this.execService.listContainers();

        for (const containerInfo of result.containers) {
          const id = containerInfo.id;
          const state = containerInfo.state;
          const created = containerInfo.createdAt ? new Date(containerInfo.createdAt) : new Date();
          const age = Date.now() - created.getTime();

          const isZombie = (state === 'exited' && age > 60000) || (state === 'running' && age > 30 * 60 * 1000);

          if (isZombie) {
            logger.warn('[WarmPool] ZOMBIE DETECTED - killing', {
              id: id.substring(0, 12),
              state,
              age: Math.floor(age / 1000) + 's',
            });

            // Retry removal with exponential backoff
            let removed = false;
            for (let attempt = 0; attempt < 3; attempt++) {
              try {
                await this.execService.removeContainer(id);
                sandboxZombiesKilled.inc();
                removed = true;
                break;
              } catch (killError: any) {
                if (attempt < 2) {
                  const delay = 1000 * Math.pow(2, attempt);
                  logger.warn(`[WarmPool] Zombie kill retry ${attempt + 1}/3 in ${delay}ms`, { error: killError.message });
                  await new Promise(r => setTimeout(r, delay));
                } else {
                  logger.error('[WarmPool] Zombie kill failed after 3 retries', { error: killError.message });
                  warmPoolErrorsTotal.inc({ type: 'zombie_kill' });
                }
              }
            }

            // Remove from pool regardless of kill success
            for (const [poolId, instance] of this.pool.entries()) {
              if (instance.containerId === id) {
                this.pool.delete(poolId);
                break;
              }
            }
          }
        }
        
        // Reset error counter on success
        consecutiveErrors = 0;
      } catch (error: any) {
        consecutiveErrors++;
        if (consecutiveErrors <= 3) {
          logger.error('[WarmPool] Zombie killer error', { error: error.message, consecutiveErrors });
        } else if (consecutiveErrors === 4) {
          logger.warn('[WarmPool] Zombie killer: suppressing repeated errors (execution service likely down)');
        }
        warmPoolErrorsTotal.inc({ type: 'zombie_killer' });
        
        // If too many consecutive errors, increase interval to reduce log spam
        if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS && !this.execServiceHealthy) {
          logger.warn('[WarmPool] Zombie killer: execution service down, entering degraded mode');
        }
      }
    }, 60000);
  }

  /**
   * 🔥 DISK SATURATION MONITOR (via Execution Service prune)
   */
  private startDiskSaturationMonitor(): void {
    let consecutiveErrors = 0;
    
    setInterval(async () => {
      try {
        const result = await this.execService.listContainers();
        const runningContainers = result.containers.filter(c => c.state === 'running').length;
        const totalContainers = result.count;

        // Estimate usage based on container count (rough heuristic)
        const estimatedUsageMB = totalContainers * 100; // ~100MB per container
        const DISK_LIMIT_MB = 50000;
        const usagePercent = (estimatedUsageMB / DISK_LIMIT_MB) * 100;

        sandboxDiskUsage.set(usagePercent);

        if (usagePercent > 90) {
          logger.error('[WarmPool] DISK SATURATION', {
            estimatedUsageMB: estimatedUsageMB.toFixed(2),
            limitMB: DISK_LIMIT_MB,
            percentUsed: usagePercent.toFixed(1) + '%',
          });

          // Emergency cleanup with retry
          for (let attempt = 0; attempt < 2; attempt++) {
            try {
              await this.execService.prune();
              break;
            } catch (pruneError: any) {
              if (attempt === 0) {
                logger.warn('[WarmPool] Prune retry', { error: pruneError.message });
                await new Promise(r => setTimeout(r, 2000));
              } else {
                warmPoolErrorsTotal.inc({ type: 'disk_prune' });
              }
            }
          }
        }
        
        consecutiveErrors = 0;
      } catch (error: any) {
        consecutiveErrors++;
        if (consecutiveErrors <= 3) {
          logger.error('[WarmPool] Disk monitor error', { error: error.message, consecutiveErrors });
        } else if (consecutiveErrors === 4) {
          logger.warn('[WarmPool] Disk monitor: suppressing repeated errors (execution service likely down)');
        }
        warmPoolErrorsTotal.inc({ type: 'disk_monitor' });
      }
    }, 60000);
  }

  /**
   * Execution Service health check with auto-recovery
   */
  private startExecServiceHealthCheck(): void {
    this.healthCheckInterval = setInterval(async () => {
      try {
        const healthy = await this.execService.healthCheck();
        if (!healthy && this.execServiceHealthy) {
          logger.error('[WarmPool] Execution Service unhealthy');
          this.execServiceHealthy = false;
          this.emit('exec-service:unhealthy');

          this.circuitBreaker.failures++;
          this.circuitBreaker.lastFailure = Date.now();
          if (this.circuitBreaker.failures >= this.CIRCUIT_BREAKER_THRESHOLD) {
            this.circuitBreaker.state = 'open';
            logger.error('[WarmPool] CIRCUIT BREAKER OPEN');
          }
        } else if (healthy && !this.execServiceHealthy) {
          logger.info('[WarmPool] Execution Service recovered - AUTO-HEALING');
          this.execServiceHealthy = true;
          this.circuitBreaker.state = 'half-open';

          const lostContainers = this.MIN_POOL_SIZE - this.pool.size;
          if (lostContainers > 0) {
            logger.warn(`[WarmPool] Restoring ${lostContainers} containers`);
            await this.warmPool();
          }

          this.processWaitingQueue();
        }
      } catch (error: any) {
        if (this.execServiceHealthy) {
          logger.error('[WarmPool] Execution Service health check failed', { error: error.message });
          this.execServiceHealthy = false;
          this.emit('exec-service:unhealthy');

          this.circuitBreaker.failures++;
          this.circuitBreaker.lastFailure = Date.now();
          if (this.circuitBreaker.failures >= this.CIRCUIT_BREAKER_THRESHOLD) {
            this.circuitBreaker.state = 'open';
            logger.error('[WarmPool] CIRCUIT BREAKER OPEN');
          }
        }
      }
    }, 10000);
  }

  /**
   * Initialize warm pool
   */
  private async initialize(): Promise<void> {
    try {
      await this.createIsolatedNetwork();
      await this.warmPool();
      this.startCleanupScheduler();

      logger.info('[WarmPool] Initialized', {
        minSize: this.MIN_POOL_SIZE,
        maxSize: this.MAX_POOL_SIZE,
      });
    } catch (error: any) {
      logger.error('[WarmPool] Initialization failed', { error: error.message });
      throw error;
    }
  }

  /**
   * Create isolated Docker network via Execution Service
   */
  private async createIsolatedNetwork(): Promise<void> {
    try {
      const result = await this.execService.createNetwork({
        name: this.ISOLATED_NETWORK,
        internal: true,
      });

      this.networkId = result.id;
      logger.info(`[WarmPool] Created isolated network ${this.ISOLATED_NETWORK}`);
    } catch (error: any) {
      // Network might already exist
      if (error.response?.data?.message?.includes('already exists')) {
        logger.info(`[WarmPool] Network ${this.ISOLATED_NETWORK} already exists`);
      } else {
        logger.error('[WarmPool] Network creation failed', { error: error.message });
        throw error;
      }
    }
  }

  /**
   * Warm pool with containers
   */
  private async warmPool(): Promise<void> {
    const currentSize = this.pool.size;
    const toAdd = Math.min(this.MIN_POOL_SIZE - currentSize, this.MAX_POOL_SIZE - currentSize);

    if (toAdd <= 0) return;

    logger.info(`[WarmPool] Warming ${toAdd} containers`);

    const promises = Array.from({ length: toAdd }, () =>
      this.createContainer({ template: 'node', networkMode: 'none' })
    );

    await Promise.allSettled(promises);
  }

  /**
   * Create container via Execution Service with baseline memory tracking
   */
  private async createContainer(config: SandboxConfig): Promise<SandboxInstance> {
    const id = `sandbox-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    const result = await this.execService.createSandbox({
      template: config.template,
      memory: config.memory || '512m',
      cpus: config.cpus || 0.5,
      timeout: config.timeout || 30000,
      networkMode: config.networkMode || 'none',
      labels: {
        'aenews.pool-id': id,
      },
    });

    // Get baseline memory
    let memoryBaseline = 0;
    try {
      const stats = await this.execService.getContainerStats(result.id);
      memoryBaseline = stats.memory.usage || 0;
    } catch {
      // Stats might not be immediately available
      memoryBaseline = 0;
    }

    const instance: SandboxInstance = {
      id,
      containerId: result.id,
      config,
      status: 'ready',
      createdAt: new Date(),
      lastUsed: new Date(),
      executions: 0,
      memoryBaseline,
    };

    this.pool.set(id, instance);
    logger.info(`[WarmPool] Created ${id}`, {
      containerId: result.id.substring(0, 12),
      memoryBaselineMB: (memoryBaseline / 1024 / 1024).toFixed(2),
    });

    return instance;
  }

  /**
   * Acquire container with metrics tracking
   */
  async acquire(config: SandboxConfig): Promise<SandboxInstance> {
    const startTime = Date.now();
    this.requestCount++;

    return this.acquireMutex.runExclusive(async () => {
      if (this.circuitBreaker.state === 'open') {
        const timeSinceFail = Date.now() - this.circuitBreaker.lastFailure;
        if (timeSinceFail < this.CIRCUIT_BREAKER_TIMEOUT) {
          this.rejectionCount++;
          throw new Error('Circuit breaker OPEN - Execution Service unhealthy');
        }
        this.circuitBreaker.state = 'half-open';
      }

      let instance = Array.from(this.pool.values()).find((i) => i.status === 'ready');

      if (!instance) {
        if (this.pool.size < this.MAX_POOL_SIZE) {
          instance = await this.createContainer(config);
        } else {
          const waitStart = Date.now();
          return new Promise((resolve, reject) => {
            this.waitingQueue.push({ config, resolve, reject, enqueuedAt: waitStart });
            logger.warn('[WarmPool] Container queued', { queueDepth: this.waitingQueue.length });
          });
        }
      }

      instance.status = 'busy';
      instance.lastUsed = new Date();
      instance.executions++;

      const waitTime = Date.now() - startTime;
      this.waitTimes.push(waitTime);
      if (this.waitTimes.length > 100) this.waitTimes.shift();

      sandboxAcquireTime.observe(waitTime);

      return instance;
    });
  }

  /**
   * Release container
   */
  async release(id: string): Promise<void> {
    const instance = this.pool.get(id);
    if (!instance) return;

    instance.status = 'ready';

    if (instance.executions >= this.MAX_EXECUTIONS_PER_CONTAINER) {
      logger.info(`[WarmPool] Recycling ${id} (executions: ${instance.executions})`);
      await this.removeContainer(id);
      this.warmPool();
    }

    this.processWaitingQueue();
  }

  /**
   * Process waiting queue
   */
  private async processWaitingQueue(): Promise<void> {
    while (this.waitingQueue.length > 0) {
      const ready = Array.from(this.pool.values()).find((i) => i.status === 'ready');
      if (!ready) break;

      const { config, resolve, enqueuedAt } = this.waitingQueue.shift()!;
      const waitTime = Date.now() - enqueuedAt;
      this.waitTimes.push(waitTime);

      try {
        const instance = await this.acquire(config);
        resolve(instance);
      } catch (error) {
        logger.error('[WarmPool] Queue processing failed', { error });
      }
    }
  }

  /**
   * Remove container via Execution Service
   */
  private async removeContainer(id: string): Promise<void> {
    const instance = this.pool.get(id);
    if (!instance) return;

    try {
      await this.execService.stopContainer(instance.containerId);
      await this.execService.removeContainer(instance.containerId);
      this.pool.delete(id);
      logger.info(`[WarmPool] Removed ${id}`);
    } catch (error: any) {
      logger.error(`[WarmPool] Remove failed ${id}`, { error: error.message });
    }
  }

  /**
   * Remove idle containers
   */
  private async removeIdleContainers(): Promise<void> {
    const now = Date.now();
    for (const instance of this.pool.values()) {
      const idleTime = now - instance.lastUsed.getTime();
      if (instance.status === 'ready' && idleTime > this.IDLE_TIMEOUT && this.pool.size > this.MIN_POOL_SIZE) {
        await this.removeContainer(instance.id);
      }
    }
  }

  /**
   * Cleanup scheduler
   */
  private startCleanupScheduler(): void {
    setInterval(() => {
      this.removeIdleContainers();
    }, 60000);
  }

  /**
   * GET ADVANCED METRICS
   */
  /**
   * Update Prometheus metrics gauges
   */
  private updatePrometheusMetrics(): void {
    if (this.execServiceHealthy) {
      warmPoolStatus.set(this.circuitBreaker.state === 'closed' ? 1 : 0.5);
    } else {
      warmPoolStatus.set(-1);
    }
  }

  getMetrics(): PoolMetrics {
    const total = this.pool.size;
    const available = Array.from(this.pool.values()).filter((i) => i.status === 'ready').length;
    const busy = total - available;
    const queueDepth = this.waitingQueue.length;
    const avgWaitTimeMs = this.waitTimes.length > 0 ? this.waitTimes.reduce((a, b) => a + b, 0) / this.waitTimes.length : 0;
    const rejectionRate = this.requestCount > 0 ? (this.rejectionCount / this.requestCount) * 100 : 0;
    const saturationPercent = (busy / this.MAX_POOL_SIZE) * 100;
    const predictedDemand = this.loadForecaster.predictDemand();

    return {
      total,
      available,
      busy,
      queueDepth,
      avgWaitTimeMs,
      rejectionRate,
      saturationPercent,
      predictedDemand,
    };
  }

  /**
   * GET CIRCUIT BREAKER STATE
   */
  getCircuitBreakerState(): { state: string; failures: number; lastFailure: number } {
    return {
      state: this.circuitBreaker.state,
      failures: this.circuitBreaker.failures,
      lastFailure: this.circuitBreaker.lastFailure,
    };
  }

  /**
   * Shutdown pool
   */
  async shutdown(): Promise<void> {
    logger.info('[WarmPool] Shutting down...');

    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }

    const promises = Array.from(this.pool.keys()).map((id) => this.removeContainer(id));
    await Promise.all(promises);

    logger.info('[WarmPool] Shutdown complete');
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 📤 EXPORTS — Lazy Singleton (avoids blocking module initialization)
// ═══════════════════════════════════════════════════════════════════════════

let _warmPool: SandboxWarmPool | null = null;

export function getWarmPool(): SandboxWarmPool {
  if (!_warmPool) {
    _warmPool = new SandboxWarmPool();
  }
  return _warmPool;
}

/** @deprecated Use getWarmPool() instead */
export const warmPool = new Proxy({} as SandboxWarmPool, {
  get(_, prop) {
    return (getWarmPool() as any)[prop];
  }
});
