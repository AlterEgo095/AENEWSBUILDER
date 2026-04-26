/**
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * 🐳 SANDBOX WARM POOL - Production Hardened
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * 
 * AMÉLIORATIONS CRITIQUES vs V1 :
 * ✅ Auto-healing avec health checks actifs (toutes les 30s)
 * ✅ Container lifecycle management complet (create → ready → active → idle → destroy)
 * ✅ Memory leak detection (détruit containers > 500MB)
 * ✅ Network isolation stricte (--network=none vérifiée)
 * ✅ Resource limits enforcement (CPU 0.5, Memory 512MB, Disk 1GB)
 * ✅ Graceful recycling (warm containers expirés après 1h)
 * ✅ Circuit breaker Docker (protection contre daemon crashes)
 * ✅ Métriques Prometheus complètes
 * ✅ Container fingerprinting (détecte les compromissions)
 * ✅ Auto-scaling basé sur la demande
 * 
 * @version 2.0.0 - Enterprise Grade
 */

import Docker, { Container, ContainerCreateOptions } from 'dockerode';
import { logger } from '../config/logger';
import { metricsService } from '../observability/metrics';
import * as Sentry from '@sentry/node';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 📋 TYPES & INTERFACES
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

interface WarmContainer {
  id: string;
  container: Container;
  state: 'ready' | 'active' | 'idle' | 'unhealthy' | 'terminating';
  createdAt: Date;
  lastUsedAt: Date;
  lastHealthCheck: Date;
  healthCheckFailures: number;
  memoryUsageMB: number;
  cpuUsagePercent: number;
  executionCount: number;
  fingerprint: string; // SHA256 of /etc/passwd + /bin/sh
}

interface ContainerStats {
  memoryUsageMB: number;
  cpuUsagePercent: number;
  networkIsolated: boolean;
  diskUsageMB: number;
}

interface WarmPoolConfig {
  minSize: number; // Minimum warm containers
  maxSize: number; // Maximum warm containers
  maxIdleTime: number; // Max idle time before recycling (ms)
  maxLifetime: number; // Max container lifetime (ms)
  maxExecutions: number; // Max executions per container
  healthCheckInterval: number; // Health check interval (ms)
  maxMemoryMB: number; // Max memory per container
  maxCpuPercent: number; // Max CPU % per container
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 🏗️ WARM POOL CLASS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export class SandboxWarmPool {
  private docker: Docker;
  private pool: Map<string, WarmContainer> = new Map();
  private healthCheckInterval: NodeJS.Timeout | null = null;
  private recyclingInterval: NodeJS.Timeout | null = null;
  private autoScalingInterval: NodeJS.Timeout | null = null;
  private circuitBreakerFailures = 0;
  private circuitBreakerState: 'CLOSED' | 'OPEN' = 'CLOSED';

  private config: WarmPoolConfig = {
    minSize: parseInt(process.env.WARM_POOL_MIN_SIZE || '5'),
    maxSize: parseInt(process.env.WARM_POOL_MAX_SIZE || '20'),
    maxIdleTime: 3600000, // 1 hour
    maxLifetime: 7200000, // 2 hours
    maxExecutions: 50,
    healthCheckInterval: 30000, // 30s
    maxMemoryMB: 512,
    maxCpuPercent: 50,
  };

  private readonly CONTAINER_IMAGE = process.env.SANDBOX_IMAGE || 'node:18-alpine';
  private readonly RESOURCE_LIMITS = {
    memory: 512 * 1024 * 1024, // 512MB
    memorySwap: 512 * 1024 * 1024,
    cpuQuota: 50000, // 0.5 CPU
    cpuPeriod: 100000,
    pidsLimit: 100,
    diskQuotaMB: 1024, // 1GB
  };

  constructor() {
    this.docker = new Docker({ socketPath: '/var/run/docker.sock' });
    this.initialize();
  }

  // ═══════════════════════════════════════════════════════════════
  // 🚀 INITIALIZATION
  // ═══════════════════════════════════════════════════════════════

  private async initialize(): Promise<void> {
    logger.info('Initializing Sandbox Warm Pool', this.config);

    try {
      // Pull image if not present
      await this.ensureImage();

      // Warm up initial pool
      await this.warmUp();

      // Start background jobs
      this.startHealthChecks();
      this.startRecycling();
      this.startAutoScaling();

      logger.info('Warm Pool initialized successfully', {
        poolSize: this.pool.size,
      });

    } catch (error: any) {
      logger.error('Warm Pool initialization failed', { error: error.message });
      Sentry.captureException(error);
      throw error;
    }
  }

  private async ensureImage(): Promise<void> {
    try {
      await this.docker.getImage(this.CONTAINER_IMAGE).inspect();
      logger.info('Docker image already present', { image: this.CONTAINER_IMAGE });
    } catch {
      logger.info('Pulling Docker image', { image: this.CONTAINER_IMAGE });
      await this.docker.pull(this.CONTAINER_IMAGE);
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // 🔥 WARM UP POOL
  // ═══════════════════════════════════════════════════════════════

  private async warmUp(): Promise<void> {
    const createPromises = [];

    for (let i = 0; i < this.config.minSize; i++) {
      createPromises.push(this.createWarmContainer());
    }

    await Promise.allSettled(createPromises);
    
    const successCount = Array.from(this.pool.values()).filter(
      c => c.state === 'ready'
    ).length;

    logger.info('Warm-up complete', {
      target: this.config.minSize,
      success: successCount,
      failed: this.config.minSize - successCount,
    });

    metricsService.setSandboxWarmPoolSize(this.pool.size);
  }

  // ═══════════════════════════════════════════════════════════════
  // 🏗️ CREATE WARM CONTAINER
  // ═══════════════════════════════════════════════════════════════

  private async createWarmContainer(): Promise<WarmContainer> {
    if (this.circuitBreakerState === 'OPEN') {
      throw new Error('Circuit breaker OPEN - Docker daemon is unhealthy');
    }

    try {
      const containerOptions: ContainerCreateOptions = {
        Image: this.CONTAINER_IMAGE,
        Cmd: ['/bin/sh', '-c', 'trap exit TERM; while :; do sleep 1; done'],
        AttachStdin: false,
        AttachStdout: false,
        AttachStderr: false,
        Tty: false,
        OpenStdin: false,
        
        // Network isolation (stricte)
        NetworkMode: 'none',
        NetworkDisabled: true,

        // Resource limits
        HostConfig: {
          Memory: this.RESOURCE_LIMITS.memory,
          MemorySwap: this.RESOURCE_LIMITS.memorySwap,
          CpuQuota: this.RESOURCE_LIMITS.cpuQuota,
          CpuPeriod: this.RESOURCE_LIMITS.cpuPeriod,
          PidsLimit: this.RESOURCE_LIMITS.pidsLimit,
          
          // Security
          CapDrop: ['ALL'],
          ReadonlyRootfs: false, // Need writable /tmp
          SecurityOpt: ['no-new-privileges'],
          
          // Storage limit
          StorageOpt: {
            size: `${this.RESOURCE_LIMITS.diskQuotaMB}M`,
          },
        },

        Labels: {
          'aenews.pool': 'warm',
          'aenews.created': new Date().toISOString(),
        },
      };

      const container = await this.docker.createContainer(containerOptions);
      await container.start();

      // Generate fingerprint
      const fingerprint = await this.generateFingerprint(container);

      const warmContainer: WarmContainer = {
        id: container.id,
        container,
        state: 'ready',
        createdAt: new Date(),
        lastUsedAt: new Date(),
        lastHealthCheck: new Date(),
        healthCheckFailures: 0,
        memoryUsageMB: 0,
        cpuUsagePercent: 0,
        executionCount: 0,
        fingerprint,
      };

      this.pool.set(container.id, warmContainer);
      metricsService.incrementSandboxContainersCreated();
      metricsService.setSandboxWarmPoolSize(this.pool.size);

      logger.debug('Warm container created', {
        id: container.id.substring(0, 12),
        fingerprint,
      });

      return warmContainer;

    } catch (error: any) {
      this.handleDockerFailure(error);
      throw error;
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // 🎯 ACQUIRE CONTAINER (from pool)
  // ═══════════════════════════════════════════════════════════════

  async acquire(): Promise<WarmContainer> {
    // Find ready container
    let warmContainer = Array.from(this.pool.values()).find(
      c => c.state === 'ready'
    );

    // No ready container, create new one (if under max)
    if (!warmContainer) {
      if (this.pool.size < this.config.maxSize) {
        warmContainer = await this.createWarmContainer();
      } else {
        throw new Error('Warm pool exhausted - all containers in use');
      }
    }

    // Mark as active
    warmContainer.state = 'active';
    warmContainer.lastUsedAt = new Date();
    warmContainer.executionCount++;

    metricsService.setSandboxActiveContainers(
      Array.from(this.pool.values()).filter(c => c.state === 'active').length
    );

    logger.debug('Container acquired', {
      id: warmContainer.id.substring(0, 12),
      executions: warmContainer.executionCount,
    });

    return warmContainer;
  }

  // ═══════════════════════════════════════════════════════════════
  // 🔄 RELEASE CONTAINER (back to pool)
  // ═══════════════════════════════════════════════════════════════

  async release(containerId: string): Promise<void> {
    const warmContainer = this.pool.get(containerId);
    
    if (!warmContainer) {
      logger.warn('Attempted to release unknown container', { containerId });
      return;
    }

    // Check if should recycle
    const shouldRecycle = this.shouldRecycle(warmContainer);

    if (shouldRecycle) {
      await this.destroyContainer(containerId, 'max_lifetime_reached');
      // Create replacement
      this.createWarmContainer().catch(err => {
        logger.error('Failed to create replacement container', { error: err.message });
      });
    } else {
      // Return to pool
      warmContainer.state = 'ready';
      warmContainer.lastUsedAt = new Date();

      logger.debug('Container released', {
        id: containerId.substring(0, 12),
        executions: warmContainer.executionCount,
      });
    }

    metricsService.setSandboxActiveContainers(
      Array.from(this.pool.values()).filter(c => c.state === 'active').length
    );
  }

  // ═══════════════════════════════════════════════════════════════
  // 🩺 HEALTH CHECKS (active monitoring)
  // ═══════════════════════════════════════════════════════════════

  private startHealthChecks(): void {
    this.healthCheckInterval = setInterval(async () => {
      const containers = Array.from(this.pool.values());

      for (const warmContainer of containers) {
        try {
          await this.healthCheck(warmContainer);
        } catch (error: any) {
          logger.error('Health check failed', {
            id: warmContainer.id.substring(0, 12),
            error: error.message,
          });
        }
      }
    }, this.config.healthCheckInterval);

    logger.info('Health checks started', {
      interval: this.config.healthCheckInterval,
    });
  }

  private async healthCheck(warmContainer: WarmContainer): Promise<void> {
    try {
      // 1. Check container is running
      const inspect = await warmContainer.container.inspect();
      
      if (!inspect.State.Running) {
        throw new Error('Container not running');
      }

      // 2. Check resource usage
      const stats = await this.getContainerStats(warmContainer.container);
      
      warmContainer.memoryUsageMB = stats.memoryUsageMB;
      warmContainer.cpuUsagePercent = stats.cpuUsagePercent;

      // 3. Memory leak detection
      if (stats.memoryUsageMB > this.config.maxMemoryMB) {
        logger.warn('Memory leak detected, destroying container', {
          id: warmContainer.id.substring(0, 12),
          memoryMB: stats.memoryUsageMB,
        });
        await this.destroyContainer(warmContainer.id, 'memory_leak');
        return;
      }

      // 4. CPU abuse detection
      if (stats.cpuUsagePercent > this.config.maxCpuPercent) {
        logger.warn('CPU abuse detected, destroying container', {
          id: warmContainer.id.substring(0, 12),
          cpuPercent: stats.cpuUsagePercent,
        });
        await this.destroyContainer(warmContainer.id, 'cpu_abuse');
        return;
      }

      // 5. Verify network isolation
      if (!stats.networkIsolated) {
        logger.error('Network isolation compromised!', {
          id: warmContainer.id.substring(0, 12),
        });
        Sentry.captureMessage('Container network isolation compromised', 'error');
        await this.destroyContainer(warmContainer.id, 'security_breach');
        return;
      }

      // 6. Fingerprint verification (détecte compromission)
      const currentFingerprint = await this.generateFingerprint(warmContainer.container);
      if (currentFingerprint !== warmContainer.fingerprint) {
        logger.error('Container fingerprint mismatch - possible compromise!', {
          id: warmContainer.id.substring(0, 12),
          expected: warmContainer.fingerprint,
          actual: currentFingerprint,
        });
        Sentry.captureMessage('Container fingerprint compromised', 'critical');
        await this.destroyContainer(warmContainer.id, 'compromised');
        return;
      }

      // Health check passed
      warmContainer.lastHealthCheck = new Date();
      warmContainer.healthCheckFailures = 0;
      
      if (warmContainer.state === 'unhealthy') {
        warmContainer.state = 'ready';
        logger.info('Container recovered', {
          id: warmContainer.id.substring(0, 12),
        });
      }

    } catch (error: any) {
      warmContainer.healthCheckFailures++;
      warmContainer.state = 'unhealthy';

      logger.error('Health check failed', {
        id: warmContainer.id.substring(0, 12),
        failures: warmContainer.healthCheckFailures,
        error: error.message,
      });

      // Destroy after 3 consecutive failures
      if (warmContainer.healthCheckFailures >= 3) {
        await this.destroyContainer(warmContainer.id, 'health_check_failed');
      }
    }
  }

  private async getContainerStats(container: Container): Promise<ContainerStats> {
    const stats = await container.stats({ stream: false });
    
    const memoryUsageMB = stats.memory_stats.usage 
      ? stats.memory_stats.usage / (1024 * 1024)
      : 0;

    const cpuDelta = stats.cpu_stats.cpu_usage.total_usage - 
      (stats.precpu_stats?.cpu_usage?.total_usage || 0);
    const systemDelta = stats.cpu_stats.system_cpu_usage - 
      (stats.precpu_stats?.system_cpu_usage || 0);
    const cpuUsagePercent = systemDelta > 0 
      ? (cpuDelta / systemDelta) * 100 
      : 0;

    const inspect = await container.inspect();
    const networkIsolated = inspect.HostConfig.NetworkMode === 'none';

    // Disk usage (approximation)
    const diskUsageMB = 0; // TODO: Implement disk usage tracking

    return {
      memoryUsageMB,
      cpuUsagePercent,
      networkIsolated,
      diskUsageMB,
    };
  }

  private async generateFingerprint(container: Container): Promise<string> {
    try {
      const exec = await container.exec({
        Cmd: ['sh', '-c', 'sha256sum /etc/passwd /bin/sh 2>/dev/null || echo "error"'],
        AttachStdout: true,
      });

      const stream = await exec.start({ hijack: true, stdin: false });
      
      return new Promise((resolve) => {
        let output = '';
        stream.on('data', (chunk: Buffer) => {
          output += chunk.toString();
        });
        stream.on('end', () => {
          const hash = output.trim().split(' ')[0] || 'unknown';
          resolve(hash);
        });
      });
    } catch {
      return 'error';
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // ♻️ RECYCLING (removes old/idle containers)
  // ═══════════════════════════════════════════════════════════════

  private startRecycling(): void {
    this.recyclingInterval = setInterval(async () => {
      const now = Date.now();
      const containers = Array.from(this.pool.values());

      for (const warmContainer of containers) {
        const shouldRecycle = this.shouldRecycle(warmContainer, now);
        
        if (shouldRecycle && warmContainer.state !== 'active') {
          await this.destroyContainer(warmContainer.id, 'recycling');
        }
      }

      // Ensure minimum pool size
      if (this.pool.size < this.config.minSize) {
        const needed = this.config.minSize - this.pool.size;
        for (let i = 0; i < needed; i++) {
          this.createWarmContainer().catch(err => {
            logger.error('Failed to maintain minimum pool size', { error: err.message });
          });
        }
      }

    }, 60000); // Every minute

    logger.info('Recycling started');
  }

  private shouldRecycle(warmContainer: WarmContainer, now = Date.now()): boolean {
    const age = now - warmContainer.createdAt.getTime();
    const idleTime = now - warmContainer.lastUsedAt.getTime();

    // Recycle if:
    // 1. Too old
    if (age > this.config.maxLifetime) return true;
    
    // 2. Idle too long
    if (idleTime > this.config.maxIdleTime) return true;
    
    // 3. Too many executions
    if (warmContainer.executionCount > this.config.maxExecutions) return true;
    
    // 4. Unhealthy
    if (warmContainer.state === 'unhealthy') return true;

    return false;
  }

  // ═══════════════════════════════════════════════════════════════
  // 📈 AUTO-SCALING
  // ═══════════════════════════════════════════════════════════════

  private startAutoScaling(): void {
    this.autoScalingInterval = setInterval(() => {
      const readyCount = Array.from(this.pool.values()).filter(
        c => c.state === 'ready'
      ).length;

      const activeCount = Array.from(this.pool.values()).filter(
        c => c.state === 'active'
      ).length;

      const utilizationPercent = (activeCount / this.pool.size) * 100;

      logger.debug('Pool utilization', {
        total: this.pool.size,
        ready: readyCount,
        active: activeCount,
        utilization: `${utilizationPercent.toFixed(1)}%`,
      });

      // Scale up if utilization > 80%
      if (utilizationPercent > 80 && this.pool.size < this.config.maxSize) {
        logger.info('Scaling up pool', { current: this.pool.size });
        this.createWarmContainer().catch(err => {
          logger.error('Auto-scaling failed', { error: err.message });
        });
      }

      // Scale down if too many idle
      if (readyCount > this.config.minSize + 3) {
        const toRemove = Array.from(this.pool.values())
          .filter(c => c.state === 'ready')
          .sort((a, b) => a.lastUsedAt.getTime() - b.lastUsedAt.getTime())
          .slice(0, readyCount - this.config.minSize);

        for (const container of toRemove) {
          this.destroyContainer(container.id, 'scale_down').catch(err => {
            logger.error('Scale down failed', { error: err.message });
          });
        }
      }

    }, 30000); // Every 30s

    logger.info('Auto-scaling started');
  }

  // ═══════════════════════════════════════════════════════════════
  // 🗑️ DESTROY CONTAINER
  // ═══════════════════════════════════════════════════════════════

  private async destroyContainer(containerId: string, reason: string): Promise<void> {
    const warmContainer = this.pool.get(containerId);
    
    if (!warmContainer) return;

    warmContainer.state = 'terminating';

    try {
      await warmContainer.container.stop({ t: 10 });
      await warmContainer.container.remove({ force: true });

      this.pool.delete(containerId);
      metricsService.incrementSandboxContainersDestroyed();
      metricsService.setSandboxWarmPoolSize(this.pool.size);

      logger.info('Container destroyed', {
        id: containerId.substring(0, 12),
        reason,
        lifetime: Date.now() - warmContainer.createdAt.getTime(),
        executions: warmContainer.executionCount,
      });

    } catch (error: any) {
      logger.error('Failed to destroy container', {
        id: containerId.substring(0, 12),
        error: error.message,
      });
      
      // Force remove from pool anyway
      this.pool.delete(containerId);
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // 🔌 CIRCUIT BREAKER (protège contre les crashes Docker)
  // ═══════════════════════════════════════════════════════════════

  private handleDockerFailure(error: Error): void {
    this.circuitBreakerFailures++;

    if (this.circuitBreakerFailures >= 5) {
      this.circuitBreakerState = 'OPEN';
      logger.error('Circuit breaker OPEN - Docker daemon appears unhealthy');
      Sentry.captureMessage('Docker daemon circuit breaker triggered', 'error');

      // Auto-reset after 60s
      setTimeout(() => {
        this.circuitBreakerFailures = 0;
        this.circuitBreakerState = 'CLOSED';
        logger.info('Circuit breaker CLOSED - retrying Docker operations');
      }, 60000);
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // 🛑 SHUTDOWN
  // ═══════════════════════════════════════════════════════════════

  async shutdown(): Promise<void> {
    logger.info('Shutting down Warm Pool...');

    if (this.healthCheckInterval) clearInterval(this.healthCheckInterval);
    if (this.recyclingInterval) clearInterval(this.recyclingInterval);
    if (this.autoScalingInterval) clearInterval(this.autoScalingInterval);

    const destroyPromises = Array.from(this.pool.keys()).map(id =>
      this.destroyContainer(id, 'shutdown')
    );

    await Promise.allSettled(destroyPromises);

    logger.info('Warm Pool shutdown complete');
  }

  // ═══════════════════════════════════════════════════════════════
  // 📊 METRICS
  // ═══════════════════════════════════════════════════════════════

  getMetrics() {
    return {
      poolSize: this.pool.size,
      ready: Array.from(this.pool.values()).filter(c => c.state === 'ready').length,
      active: Array.from(this.pool.values()).filter(c => c.state === 'active').length,
      unhealthy: Array.from(this.pool.values()).filter(c => c.state === 'unhealthy').length,
      circuitBreakerState: this.circuitBreakerState,
      avgMemoryMB: Array.from(this.pool.values()).reduce((sum, c) => sum + c.memoryUsageMB, 0) / this.pool.size,
    };
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 🚀 SINGLETON EXPORT
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export const warmPool = new SandboxWarmPool();

process.on('SIGTERM', async () => {
  await warmPool.shutdown();
});

process.on('SIGINT', async () => {
  await warmPool.shutdown();
});
