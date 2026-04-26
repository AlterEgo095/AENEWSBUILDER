/**
 * Sandbox Warm Pool - Production Implementation
 * Features: Container pre-warming, network isolation, resource limits, auto-cleanup
 * Target: < 2s cold start latency
 * @module sandbox/warm-pool
 */

import Docker from 'dockerode';
import { EventEmitter } from 'events';
import { Mutex } from 'async-mutex';
import { logger } from '../config/logger.js';

const docker = new Docker();

export interface SandboxConfig {
  template: 'react' | 'next' | 'express' | 'python' | 'node';
  memory?: string; // e.g., '512m'
  cpus?: number; // e.g., 0.5
  timeout?: number; // seconds
  networkMode?: 'none' | 'bridge' | 'host';
}

export interface SandboxInstance {
  id: string;
  container: Docker.Container;
  config: SandboxConfig;
  status: 'warming' | 'ready' | 'busy' | 'cleanup';
  createdAt: Date;
  lastUsed: Date;
  executions: number;
}

export class SandboxWarmPool extends EventEmitter {
  private pool: Map<string, SandboxInstance> = new Map();
  private templates: Map<string, Docker.Image> = new Map();
  private acquireMutex = new Mutex(); // Thread-safe replacement
  private dockerHealthy = true;
  private healthCheckInterval?: NodeJS.Timeout;
  
  // 🔥 CHAOS RESISTANCE
  private circuitBreaker = { failures: 0, lastFailure: 0, state: 'closed' as 'open' | 'half-open' | 'closed' };
  private readonly CIRCUIT_BREAKER_THRESHOLD = 5;
  private readonly CIRCUIT_BREAKER_TIMEOUT = 30000; // 30s before retry
  
  // 🔥 MEMORY LEAK DETECTION
  private memoryLeakDetector?: NodeJS.Timeout;
  
  // 🔥 WAITING QUEUE (graceful degradation)
  private waitingQueue: Array<{ config: SandboxConfig; resolve: Function; reject: Function }> = [];

  // Pool configuration
  private readonly MIN_POOL_SIZE = 3;
  private readonly MAX_POOL_SIZE = 50; // Increased for scale
  private readonly IDLE_TIMEOUT = 5 * 60 * 1000; // 5 minutes
  private readonly MAX_EXECUTIONS_PER_CONTAINER = 50;
  private readonly MAX_DISK_USAGE_MB = 5000; // 5GB per container

  // Network isolation
  private readonly ISOLATED_NETWORK = 'sandbox-isolated';

  constructor() {
    super();
    this.initialize();
    this.startDockerHealthCheck();
    this.startMemoryLeakDetector();
    this.startZombieKiller(); // 🔥 NEW: Kill zombie containers
    this.startDiskSaturationMonitor(); // 🔥 NEW: Prevent disk full
  }

  /**
   * Monitor Docker daemon health + AUTO-RECOVERY
   */
  private startDockerHealthCheck() {
    this.healthCheckInterval = setInterval(async () => {
      try {
        await docker.ping();
        if (!this.dockerHealthy) {
          logger.info('✅ Docker daemon recovered - AUTO-HEALING POOL');
          this.dockerHealthy = true;
          
          // 🔥 RESET CIRCUIT BREAKER
          this.circuitBreaker.state = 'half-open';
          
          // 🔥 AUTO-RECOVERY: Restore lost containers
          const lostContainers = this.MIN_POOL_SIZE - this.pool.size;
          if (lostContainers > 0) {
            logger.warn(`⚠️ Detected ${lostContainers} lost containers - restoring...`);
            await this.warmPool();
          }
          
          // 🔥 PROCESS WAITING QUEUE
          this.processWaitingQueue();
        }
      } catch (error: any) {
        if (this.dockerHealthy) {
          logger.error('❌ Docker daemon unhealthy', { error: error.message });
          this.dockerHealthy = false;
          this.emit('docker:unhealthy');
          
          // 🔥 OPEN CIRCUIT BREAKER
          this.circuitBreaker.failures++;
          this.circuitBreaker.lastFailure = Date.now();
          if (this.circuitBreaker.failures >= this.CIRCUIT_BREAKER_THRESHOLD) {
            this.circuitBreaker.state = 'open';
            logger.error('🔴 CIRCUIT BREAKER OPEN - Too many Docker failures');
          }
        }
      }
    }, 10000); // Check every 10s
  }

  /**
   * Initialize warm pool
   */
  private async initialize() {
    try {
      // Create isolated network
      await this.createIsolatedNetwork();

      // Pull and cache template images
      await this.pullTemplateImages();

      // Pre-warm containers
      await this.warmPool();

      // Start cleanup scheduler
      this.startCleanupScheduler();

      logger.info('✅ Sandbox Warm Pool initialized', {
        minSize: this.MIN_POOL_SIZE,
        maxSize: this.MAX_POOL_SIZE,
      });
    } catch (error: any) {
      logger.error('Failed to initialize warm pool', { error: error.message });
      throw error;
    }
  }

  /**
   * Create isolated Docker network (no internet access)
   */
  private async createIsolatedNetwork() {
    try {
      const networks = await docker.listNetworks({
        filters: { name: [this.ISOLATED_NETWORK] },
      });

      if (networks.length > 0) {
        logger.info(`Network ${this.ISOLATED_NETWORK} already exists`);
        return;
      }

      await docker.createNetwork({
        Name: this.ISOLATED_NETWORK,
        Driver: 'bridge',
        Internal: true, // No external access
        EnableIPv6: false,
        IPAM: {
          Config: [{ Subnet: '172.25.0.0/16' }],
        },
      });

      logger.info(`✅ Created isolated network: ${this.ISOLATED_NETWORK}`);
    } catch (error: any) {
      logger.error('Failed to create isolated network', {
        error: error.message,
      });
    }
  }

  /**
   * Pull template images
   */
  private async pullTemplateImages() {
    const templates = [
      { name: 'react', image: 'node:20-alpine' },
      { name: 'next', image: 'node:20-alpine' },
      { name: 'express', image: 'node:20-alpine' },
      { name: 'python', image: 'python:3.11-slim' },
      { name: 'node', image: 'node:20-alpine' },
    ];

    for (const tpl of templates) {
      try {
        logger.info(`Pulling template image: ${tpl.image}`);

        await new Promise<void>((resolve, reject) => {
          docker.pull(tpl.image, (err: any, stream: any) => {
            if (err) return reject(err);

            docker.modem.followProgress(
              stream,
              (err: any) => (err ? reject(err) : resolve()),
              (event: any) => {
                if (event.status === 'Download complete') {
                  logger.debug(`Downloaded layer: ${event.id}`);
                }
              }
            );
          });
        });

        const image = docker.getImage(tpl.image);
        this.templates.set(tpl.name, image);

        logger.info(`✅ Template ready: ${tpl.name}`);
      } catch (error: any) {
        logger.error(`Failed to pull template ${tpl.name}`, {
          error: error.message,
        });
      }
    }
  }

  /**
   * Pre-warm containers
   */
  private async warmPool() {
    const targetSize = Math.min(this.MIN_POOL_SIZE, this.MAX_POOL_SIZE);
    const currentSize = this.pool.size;
    const needed = targetSize - currentSize;

    if (needed <= 0) return;

    logger.info(`Warming ${needed} containers...`);

    const promises = [];
    for (let i = 0; i < needed; i++) {
      promises.push(
        this.createContainer({
          template: 'node',
          memory: '512m',
          cpus: 0.5,
          networkMode: 'none',
        })
      );
    }

    await Promise.all(promises);
  }

  /**
   * Create and start a container
   */
  private async createContainer(config: SandboxConfig): Promise<SandboxInstance> {
    const id = `sandbox-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    try {
      const template = config.template || 'node';
      const image = this.templates.get(template);

      if (!image) {
        throw new Error(`Template ${template} not found`);
      }

      // Create container with resource limits + DISK QUOTA
      const container = await docker.createContainer({
        name: id,
        Image: image.id,
        Cmd: ['/bin/sh', '-c', 'tail -f /dev/null'], // Keep alive
        HostConfig: {
          Memory: this.parseMemory(config.memory || '512m'),
          MemorySwap: this.parseMemory(config.memory || '512m'), // No swap
          NanoCpus: (config.cpus || 0.5) * 1e9,
          NetworkMode: config.networkMode || 'none', // Isolated by default
          PidsLimit: 100, // Max 100 processes
          ReadonlyRootfs: false,
          SecurityOpt: ['no-new-privileges:true'],
          CapDrop: ['ALL'], // Drop all capabilities
          AutoRemove: false, // Manual cleanup
          // DISK QUOTA (requires overlay2 driver with quota support)
          StorageOpt: {
            size: `${this.MAX_DISK_USAGE_MB}M`,
          },
        },
        Labels: {
          'aenews.type': 'sandbox',
          'aenews.template': template,
          'aenews.pool': 'warm',
        },
      });

      // Start container
      await container.start();

      const instance: SandboxInstance = {
        id,
        container,
        config,
        status: 'ready',
        createdAt: new Date(),
        lastUsed: new Date(),
        executions: 0,
      };

      this.pool.set(id, instance);

      logger.info('Container created', {
        id,
        template,
        memory: config.memory,
        cpus: config.cpus,
      });

      this.emit('container:created', instance);

      return instance;
    } catch (error: any) {
      logger.error('Failed to create container', {
        id,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Acquire a container from the pool (THREAD-SAFE with Mutex)
   */
  async acquire(config: SandboxConfig): Promise<SandboxInstance> {
    // 🔥 CHECK CIRCUIT BREAKER
    if (this.circuitBreaker.state === 'open') {
      const timeSinceLastFailure = Date.now() - this.circuitBreaker.lastFailure;
      if (timeSinceLastFailure < this.CIRCUIT_BREAKER_TIMEOUT) {
        throw new Error(`Circuit breaker OPEN - Docker unstable (retry in ${Math.ceil((this.CIRCUIT_BREAKER_TIMEOUT - timeSinceLastFailure) / 1000)}s)`);
      }
      // Try half-open
      this.circuitBreaker.state = 'half-open';
    }
    
    // Check Docker health first
    if (!this.dockerHealthy) {
      // 🔥 GRACEFUL DEGRADATION: Add to waiting queue instead of failing
      logger.warn('Docker unhealthy - adding request to waiting queue');
      return new Promise((resolve, reject) => {
        this.waitingQueue.push({ config, resolve, reject });
        // Auto-reject after 60s
        setTimeout(() => {
          const index = this.waitingQueue.findIndex(item => item.resolve === resolve);
          if (index !== -1) {
            this.waitingQueue.splice(index, 1);
            reject(new Error('Timeout waiting for Docker recovery'));
          }
        }, 60000);
      });
    }

    const startTime = Date.now();

    // CRITICAL: Use Mutex to prevent race conditions
    const release = await this.acquireMutex.acquire();

    try {
      // Find available container
      let instance: SandboxInstance | undefined;
      
      for (const inst of this.pool.values()) {
        if (
          inst.status === 'ready' &&
          inst.config.template === config.template &&
          inst.executions < this.MAX_EXECUTIONS_PER_CONTAINER
        ) {
          instance = inst;
          break;
        }
      }

      if (!instance) {
        // Create new container if pool not full
        if (this.pool.size < this.MAX_POOL_SIZE) {
          instance = await this.createContainer(config);
        } else {
          // 🔥 GRACEFUL DEGRADATION: Add to waiting queue
          logger.warn('Pool saturated - adding request to waiting queue');
          release(); // Release lock first
          
          return new Promise((resolve, reject) => {
            this.waitingQueue.push({ config, resolve, reject });
            // Auto-reject after 30s
            setTimeout(() => {
              const index = this.waitingQueue.findIndex(item => item.resolve === resolve);
              if (index !== -1) {
                this.waitingQueue.splice(index, 1);
                reject(new Error('Timeout waiting for available container - pool overloaded'));
              }
            }, 30000);
          });
        }
      }

      instance.status = 'busy';
      instance.lastUsed = new Date();
      instance.executions++;
      
      // 🔥 SUCCESS: Reset circuit breaker
      if (this.circuitBreaker.state === 'half-open') {
        this.circuitBreaker.state = 'closed';
        this.circuitBreaker.failures = 0;
        logger.info('✅ Circuit breaker CLOSED - Docker stable');
      }

      const latency = Date.now() - startTime;

      logger.info('Container acquired', {
        id: instance.id,
        latency: `${latency}ms`,
        executions: instance.executions,
        poolSize: this.pool.size,
      });

      this.emit('container:acquired', { instance, latency });

      return instance;
    } catch (error: any) {
      // 🔥 CIRCUIT BREAKER: Track failures
      this.circuitBreaker.failures++;
      this.circuitBreaker.lastFailure = Date.now();
      throw error;
    } finally {
      release();
    }
  }

  /**
   * Release a container back to the pool
   */
  async release(instanceId: string) {
    
    const instance = this.pool.get(instanceId);
    if (!instance) {
      logger.warn('Cannot release unknown container', { id: instanceId });
      return;
    }

    // Check if container should be recycled
    if (instance.executions >= this.MAX_EXECUTIONS_PER_CONTAINER) {
      await this.removeContainer(instanceId);
      // Replace with a new warm container
      await this.createContainer(instance.config);
      
      // 🔥 PROCESS WAITING QUEUE
      this.processWaitingQueue();
      return;
    }

    instance.status = 'ready';
    instance.lastUsed = new Date();

    // Check disk usage and recycle if exceeded
    try {
      const stats = await instance.container.stats({ stream: false });
      const diskUsageMB = (stats as any).storage_stats?.used_bytes / 1024 / 1024 || 0;

      if (diskUsageMB > this.MAX_DISK_USAGE_MB * 0.9) {
        logger.warn('Container disk usage high - recycling', {
          id: instance.id,
          diskUsageMB,
          limit: this.MAX_DISK_USAGE_MB,
        });
        await this.removeContainer(instanceId);
        await this.createContainer(instance.config);
        
        // 🔥 PROCESS WAITING QUEUE
        this.processWaitingQueue();
        return;
      }
    } catch (error: any) {
      logger.warn('Could not check disk usage', { id: instanceId, error: error.message });
    }

    logger.info('Container released', {
      id: instance.id,
      executions: instance.executions,
    });

    this.emit('container:released', instance);
    
    // 🔥 PROCESS WAITING QUEUE
    this.processWaitingQueue();
  }

  /**
   * Execute command in a container
   */
  async execute(
    instanceId: string,
    cmd: string[],
    options: { timeout?: number } = {}
  ): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    const instance = this.pool.get(instanceId);
    if (!instance) {
      throw new Error(`Container ${instanceId} not found`);
    }

    if (instance.status !== 'busy') {
      throw new Error(`Container ${instanceId} is not acquired`);
    }

    const exec = await instance.container.exec({
      Cmd: cmd,
      AttachStdout: true,
      AttachStderr: true,
    });

    const stream = await exec.start({ hijack: true, stdin: false });

    return new Promise((resolve, reject) => {
      let stdout = '';
      let stderr = '';

      const timeout = setTimeout(() => {
        stream.destroy();
        reject(new Error('Execution timeout'));
      }, options.timeout || 30000);

      stream.on('data', (chunk: Buffer) => {
        const str = chunk.toString();
        if (str.includes('stdout')) stdout += str;
        else stderr += str;
      });

      stream.on('end', async () => {
        clearTimeout(timeout);

        const inspectData = await exec.inspect();
        resolve({
          stdout,
          stderr,
          exitCode: inspectData.ExitCode || 0,
        });
      });

      stream.on('error', (err) => {
        clearTimeout(timeout);
        reject(err);
      });
    });
  }

  /**
   * Wait for an available container
   */
  private async waitForAvailableContainer(
    config: SandboxConfig,
    timeout: number
  ): Promise<SandboxInstance> {
    const startTime = Date.now();

    return new Promise((resolve, reject) => {
      const checkInterval = setInterval(() => {
        const instance = Array.from(this.pool.values()).find(
          (inst) =>
            inst.status === 'ready' && inst.config.template === config.template
        );

        if (instance) {
          clearInterval(checkInterval);
          resolve(instance);
        } else if (Date.now() - startTime > timeout) {
          clearInterval(checkInterval);
          reject(new Error('Timeout waiting for available container'));
        }
      }, 100);
    });
  }

  /**
   * Remove a container
   */
  private async removeContainer(instanceId: string) {
    const instance = this.pool.get(instanceId);
    if (!instance) return;

    try {
      instance.status = 'cleanup';
      await instance.container.stop({ t: 5 });
      await instance.container.remove({ force: true });
      this.pool.delete(instanceId);

      logger.info('Container removed', { id: instanceId });
      this.emit('container:removed', instance);
    } catch (error: any) {
      logger.error('Failed to remove container', {
        id: instanceId,
        error: error.message,
      });
    }
  }

  /**
   * Cleanup idle containers
   */
  private startCleanupScheduler() {
    setInterval(async () => {
      const now = Date.now();

      for (const [id, instance] of this.pool.entries()) {
        const idleTime = now - instance.lastUsed.getTime();

        // Remove idle containers
        if (
          instance.status === 'ready' &&
          idleTime > this.IDLE_TIMEOUT &&
          this.pool.size > this.MIN_POOL_SIZE
        ) {
          await this.removeContainer(id);
        }
      }

      // Ensure minimum pool size
      await this.warmPool();
    }, 60000); // Check every minute
  }

  /**
   * Get pool stats
   */
  getStats() {
    const stats = {
      total: this.pool.size,
      ready: 0,
      busy: 0,
      warming: 0,
      cleanup: 0,
      byTemplate: {} as Record<string, number>,
    };

    for (const instance of this.pool.values()) {
      stats[instance.status]++;
      const tpl = instance.config.template;
      stats.byTemplate[tpl] = (stats.byTemplate[tpl] || 0) + 1;
    }

    return stats;
  }

  /**
   * Shutdown pool
   */
  async shutdown() {
    logger.info('Shutting down warm pool...');

    // Stop health check
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }
    
    // 🔥 Stop memory leak detector
    if (this.memoryLeakDetector) {
      clearInterval(this.memoryLeakDetector);
    }

    const promises = Array.from(this.pool.keys()).map((id) =>
      this.removeContainer(id)
    );

    await Promise.all(promises);

    logger.info('✅ Warm pool shut down');
  }
  
  /**
   * 🔥 ZOMBIE CONTAINER KILLER (detect stuck containers)
   */
  private startZombieKiller() {
    setInterval(async () => {
      try {
        // List all containers with aenews.type=sandbox label
        const containers = await docker.listContainers({
          all: true,
          filters: {
            label: ['aenews.type=sandbox'],
          },
        });
        
        for (const containerInfo of containers) {
          const id = containerInfo.Id;
          const state = containerInfo.State;
          const created = new Date(containerInfo.Created * 1000);
          const age = Date.now() - created.getTime();
          
          // Zombie conditions:
          // 1. Exited but still in pool
          // 2. Running for >30 min with status 'busy' (likely stuck)
          const isZombie = 
            (state === 'exited' && age > 60000) || // Dead for >1min
            (state === 'running' && age > 30 * 60 * 1000); // Running >30min
          
          if (isZombie) {
            logger.warn('🧟 ZOMBIE CONTAINER DETECTED - killing', {
              id: id.substring(0, 12),
              state,
              age: Math.floor(age / 1000) + 's',
            });
            
            // Force kill
            const container = docker.getContainer(id);
            try {
              await container.stop({ t: 1 });
              await container.remove({ force: true });
            } catch (killError: any) {
              logger.error('Failed to kill zombie', {
                id: id.substring(0, 12),
                error: killError.message,
              });
            }
            
            // Remove from pool if exists
            for (const [poolId, instance] of this.pool.entries()) {
              if (instance.container.id === id) {
                this.pool.delete(poolId);
                break;
              }
            }
          }
        }
      } catch (error: any) {
        logger.error('Zombie killer error', { error: error.message });
      }
    }, 60000); // Check every 1 min
  }
  
  /**
   * 🔥 DISK SATURATION MONITOR (prevent disk full crashes)
   */
  private startDiskSaturationMonitor() {
    setInterval(async () => {
      try {
        // Get Docker disk usage
        const df = await docker.df();
        const volumesSize = df.Volumes?.reduce((sum, v) => sum + v.UsageData.Size, 0) || 0;
        const imagesSize = df.Images?.reduce((sum, i) => sum + i.Size, 0) || 0;
        const containersSize = df.Containers?.reduce((sum, c) => sum + c.SizeRw, 0) || 0;
        
        const totalUsageMB = (volumesSize + imagesSize + containersSize) / 1024 / 1024;
        const DISK_LIMIT_MB = 50000; // 50GB limit
        
        if (totalUsageMB > DISK_LIMIT_MB * 0.9) {
          logger.error('🚨 DISK SATURATION DETECTED', {
            usageMB: totalUsageMB.toFixed(2),
            limitMB: DISK_LIMIT_MB,
            percentUsed: ((totalUsageMB / DISK_LIMIT_MB) * 100).toFixed(1) + '%',
          });
          
          // Emergency cleanup: remove oldest idle containers
          const sortedByAge = Array.from(this.pool.entries())
            .filter(([, instance]) => instance.status === 'ready')
            .sort(([, a], [, b]) => a.lastUsed.getTime() - b.lastUsed.getTime());
          
          // Remove oldest 50%
          const toRemove = sortedByAge.slice(0, Math.ceil(sortedByAge.length / 2));
          logger.warn(`🧹 Emergency cleanup: removing ${toRemove.length} containers`);
          
          for (const [id] of toRemove) {
            await this.removeContainer(id);
          }
          
          // Prune unused images and volumes
          await docker.pruneImages({ filters: { dangling: { true: true } } });
          await docker.pruneVolumes();
        }
      } catch (error: any) {
        logger.error('Disk saturation monitor error', { error: error.message });
      }
    }, 120000); // Check every 2 min
  }

  /**
   * 🔥 MEMORY LEAK DETECTOR (proactive monitoring)
   */
  private startMemoryLeakDetector() {
    this.memoryLeakDetector = setInterval(async () => {
      for (const [id, instance] of this.pool.entries()) {
        try {
          const stats = await instance.container.stats({ stream: false });
          const memoryUsageMB = (stats as any).memory_stats?.usage / 1024 / 1024 || 0;
          const memoryLimitMB = this.parseMemory(instance.config.memory || '512m') / 1024 / 1024;
          const memoryUsagePercent = (memoryUsageMB / memoryLimitMB) * 100;

          // 🚨 MEMORY LEAK DETECTED
          if (memoryUsagePercent > 85) {
            logger.warn('🚨 Memory leak detected - recycling container', {
              id: instance.id,
              memoryUsageMB: memoryUsageMB.toFixed(2),
              memoryLimitMB,
              usagePercent: memoryUsagePercent.toFixed(1),
            });
            
            // Force recycle
            if (instance.status === 'ready') {
              await this.removeContainer(id);
              await this.createContainer(instance.config);
            }
          }
        } catch (error: any) {
          // Container might be dead - clean it up
          logger.error('Failed to check container memory - removing', {
            id: instance.id,
            error: error.message,
          });
          await this.removeContainer(id);
        }
      }
    }, 30000); // Check every 30s
  }

  /**
   * 🔥 PROCESS WAITING QUEUE (after Docker recovery)
   */
  private processWaitingQueue() {
    if (this.waitingQueue.length === 0) return;

    logger.info(`🔄 Processing ${this.waitingQueue.length} queued requests...`);

    // Process queue in FIFO order
    while (this.waitingQueue.length > 0) {
      const request = this.waitingQueue.shift();
      if (request) {
        this.acquire(request.config)
          .then(request.resolve)
          .catch(request.reject);
      }
    }
  }

  /**
   * Parse memory string to bytes
   */
  private parseMemory(mem: string): number {
    const units: Record<string, number> = {
      k: 1024,
      m: 1024 * 1024,
      g: 1024 * 1024 * 1024,
    };

    const match = mem.match(/^(\d+)([kmg])$/i);
    if (!match) throw new Error(`Invalid memory format: ${mem}`);

    const [, value, unit] = match;
    return parseInt(value, 10) * units[unit.toLowerCase()];
  }
}

export const warmPool = new SandboxWarmPool();
