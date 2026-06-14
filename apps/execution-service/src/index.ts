/**
 * AENEWS Execution Service - Isolated Docker API
 * 
 * This service provides an authenticated, audited API layer over Docker operations.
 * It is the ONLY container with access to the Docker socket.
 * All other services must go through this API for container management.
 * 
 * Security Features:
 * - JWT authentication (shared secret with API)
 * - Rate limiting per client
 * - Resource limits enforced (memory, CPU, timeout)
 * - Full audit trail of all operations
 * - No external network exposure (internal only)
 * 
 * @version 1.0.0
 */

import Fastify from 'fastify';
import jwt from '@fastify/jwt';
import rateLimit from '@fastify/rate-limit';
import Docker from 'dockerode';
import { z } from 'zod';
import Redis from 'ioredis';
import client from 'prom-client';

// ═══════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════

const PORT = parseInt(process.env.EXEC_PORT || '3010', 10);
const JWT_SECRET = process.env.EXEC_JWT_SECRET || process.env.JWT_SECRET || 'change-me';
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const NODE_ENV = process.env.NODE_ENV || 'development';

// Default resource limits
const DEFAULT_MEMORY = '512m';
const DEFAULT_CPUS = 0.5;
const DEFAULT_TIMEOUT = 30000; // 30s
const MAX_MEMORY = '2g';
const MAX_CPUS = 2.0;
const MAX_TIMEOUT = 300000; // 5 min

// Allowed templates with their image mappings
const TEMPLATE_IMAGES: Record<string, string> = {
  react: 'node:18-alpine',
  next: 'node:18-alpine',
  express: 'node:18-alpine',
  node: 'node:18-alpine',
  python: 'python:3.11-slim',
};

// ═══════════════════════════════════════════════════════════════════════════
// DOCKER CLIENT
// ═══════════════════════════════════════════════════════════════════════════

const docker = new Docker({ socketPath: '/var/run/docker.sock' });

// ═══════════════════════════════════════════════════════════════════════════
// REDIS (for audit trail & rate limiting)
// ═══════════════════════════════════════════════════════════════════════════

let redis: Redis | null = null;
try {
  redis = new Redis(REDIS_URL, {
    maxRetriesPerRequest: 3,
    lazyConnect: true,
    retryStrategy: (times) => Math.min(times * 200, 5000),
  });
  redis.on('error', (err) => {
    app.log.error({ err }, '[Redis] Connection error');
  });
} catch (e: any) {
  // Redis not available - audit logs will fall back to logger only
}


// ═══════════════════════════════════════════════════════════════════════════
// PROMETHEUS METRICS
// ═══════════════════════════════════════════════════════════════════════════

// Create a custom registry for execution service metrics
const register = new client.Registry();

// Default metrics (process CPU, memory, event loop lag, etc.)
client.collectDefaultMetrics({ register, prefix: 'exec_' });

// Custom metrics
const containersCreated = new client.Counter({
  name: 'exec_containers_created_total',
  help: 'Total number of containers created',
  registers: [register],
});

const containersRemoved = new client.Counter({
  name: 'exec_containers_removed_total',
  help: 'Total number of containers removed',
  registers: [register],
});

const containersErrors = new client.Counter({
  name: 'exec_containers_errors_total',
  help: 'Total number of container operation errors',
  labelNames: ['operation'],
  registers: [register],
});

const executionDuration = new client.Histogram({
  name: 'exec_duration_seconds',
  help: 'Execution operation duration in seconds',
  labelNames: ['operation'],
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30, 60],
  registers: [register],
});

const activeContainers = new client.Gauge({
  name: 'exec_active_containers',
  help: 'Number of currently active containers',
  registers: [register],
});

const sandboxesCreated = new client.Counter({
  name: 'exec_sandboxes_created_total',
  help: 'Total number of sandboxes created',
  labelNames: ['template'],
  registers: [register],
});

const sandboxesErrors = new client.Counter({
  name: 'exec_sandboxes_errors_total',
  help: 'Total number of sandbox operation errors',
  registers: [register],
});

// Periodically update active containers gauge
setInterval(async () => {
  try {
    const containers = await docker.listContainers({
      filters: { label: ['aenews.managed=true'] },
    });
    activeContainers.set(containers.length);
  } catch {
    // Docker might not be available
  }
}, 15000);


// ═══════════════════════════════════════════════════════════════════════════
// AUDIT LOG
// ═══════════════════════════════════════════════════════════════════════════

interface AuditEntry {
  timestamp: string;
  action: string;
  containerId?: string;
  clientIp?: string;
  details?: Record<string, unknown>;
  status: 'success' | 'failure';
  error?: string;
}

async function auditLog(entry: AuditEntry): Promise<void> {
  const logLine = `[AUDIT] ${entry.timestamp} | ${entry.action} | ${entry.status} | ${entry.containerId || 'N/A'} | ${entry.clientIp || 'N/A'}`;
  
  if (entry.status === 'failure') {
    app.log.error({ error: entry.error }, logLine);
  } else {
    app.log.info(logLine);
  }

  // Store in Redis for persistence (TTL 7 days)
  if (redis && redis.status === 'ready') {
    try {
      const key = `audit:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
      await redis.setex(key, 7 * 24 * 3600, JSON.stringify(entry));
    } catch (e: any) {
      app.log.error({ error: e.message }, '[Audit] Redis write failed');
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// SCHEMA VALIDATION
// ═══════════════════════════════════════════════════════════════════════════

const createContainerSchema = z.object({
  image: z.string().min(1).max(200),
  name: z.string().min(1).max(100).optional(),
  cmd: z.array(z.string()).optional(),
  env: z.array(z.string()).optional(),
  memory: z.string().optional(),
  cpus: z.number().min(0.1).max(MAX_CPUS).optional(),
  timeout: z.number().min(1000).max(MAX_TIMEOUT).optional(),
  networkMode: z.enum(['none', 'bridge', 'host']).optional(),
  labels: z.record(z.string()).optional(),
  workingDir: z.string().optional(),
});

const createSandboxSchema = z.object({
  template: z.enum(['react', 'next', 'express', 'python', 'node']),
  memory: z.string().optional(),
  cpus: z.number().min(0.1).max(MAX_CPUS).optional(),
  timeout: z.number().min(1000).max(MAX_TIMEOUT).optional(),
  networkMode: z.enum(['none', 'bridge']).optional(),
  env: z.array(z.string()).optional(),
  labels: z.record(z.string()).optional(),
});

// ═══════════════════════════════════════════════════════════════════════════
// HELPER: Parse memory string to bytes
// ═══════════════════════════════════════════════════════════════════════════

function parseMemoryToBytes(mem: string): number {
  const match = mem.match(/^(\d+)(m|g|mb|gb)?$/i);
  if (!match) return 512 * 1024 * 1024; // default 512MB
  const value = parseInt(match[1], 10);
  const unit = (match[2] || 'm').toLowerCase();
  if (unit.startsWith('g')) return value * 1024 * 1024 * 1024;
  return value * 1024 * 1024;
}

// ═══════════════════════════════════════════════════════════════════════════
// FASTIFY SERVER
// ═══════════════════════════════════════════════════════════════════════════

const app = Fastify({
  logger: {
    level: NODE_ENV === 'production' ? 'info' : 'debug',
    transport: NODE_ENV !== 'production' ? { target: 'pino-pretty' } : undefined,
  },
  trustProxy: true,
});

// JWT Authentication
app.register(jwt, {
  secret: JWT_SECRET,
});

// Rate Limiting
app.register(rateLimit, {
  max: 60,
  timeWindow: '1 minute',
  keyGenerator: (request) => {
    return request.ip;
  },
});

// ═══════════════════════════════════════════════════════════════════════════
// AUTH MIDDLEWARE
// ═══════════════════════════════════════════════════════════════════════════

app.decorate('authenticate', async function (request: any, reply: any) {
  try {
    await request.jwtVerify();
  } catch (err) {
    reply.code(401).send({ error: 'Unauthorized', message: 'Invalid or missing JWT token' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// HEALTH CHECK (no auth required)
// ═══════════════════════════════════════════════════════════════════════════

app.get('/exec/health', async (request, reply) => {
  let dockerOk = false;
  let redisOk = false;

  try {
    await docker.ping();
    dockerOk = true;
  } catch {
    dockerOk = false;
  }

  try {
    redisOk = redis !== null && redis.status === 'ready';
  } catch {
    redisOk = false;
  }

  const healthy = dockerOk;
  const status = healthy ? 200 : 503;

  return reply.code(status).send({
    status: healthy ? 'healthy' : 'degraded',
    timestamp: new Date().toISOString(),
    services: {
      docker: dockerOk ? 'up' : 'down',
      redis: redisOk ? 'up' : 'down',
    },
    version: '1.0.0',
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// METRICS ENDPOINT (no auth required - for Prometheus scraping)
// ═══════════════════════════════════════════════════════════════════════════

app.get('/exec/metrics', async (request, reply) => {
  try {
    const metrics = await register.metrics();
    return reply
      .header('Content-Type', register.contentType)
      .send(metrics);
  } catch (error: any) {
    return reply.code(500).send({ error: 'Metrics collection failed', message: error.message });
  }
});



// ═══════════════════════════════════════════════════════════════════════════
// CONTAINER ENDPOINTS (all require auth)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * POST /exec/container/create
 * Create an isolated container with resource limits
 */
app.post('/exec/container/create', {
  preHandler: [(app as any).authenticate],
}, async (request, reply) => {
  const clientIp = request.ip;
  const timestamp = new Date().toISOString();

  try {
    const body = createContainerSchema.parse(request.body);
    const memory = body.memory || DEFAULT_MEMORY;
    const cpus = body.cpus || DEFAULT_CPUS;
    const timeout = body.timeout || DEFAULT_TIMEOUT;

    // Enforce max limits
    const memoryBytes = Math.min(parseMemoryToBytes(memory), parseMemoryToBytes(MAX_MEMORY));
    const cpuQuota = Math.min(cpus, MAX_CPUS) * 100000;

    const containerOptions: Docker.ContainerCreateOptions = {
      Image: body.image,
      name: body.name || `exec-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      Cmd: body.cmd || ['tail', '-f', '/dev/null'],
      Env: body.env || [],
      WorkingDir: body.workingDir,
      Labels: {
        'aenews.type': 'execution',
        'aenews.managed': 'true',
        'aenews.timeout': timeout.toString(),
        'aenews.createdAt': timestamp,
        ...(body.labels || {}),
      },
      HostConfig: {
        Memory: memoryBytes,
        CpuQuota: cpuQuota,
        CpuPeriod: 100000,
        CapDrop: ['ALL'],
        SecurityOpt: ['no-new-privileges'],
        NetworkMode: body.networkMode || 'none',
        AutoRemove: false,
        PidsLimit: 100,
        Tmpfs: {
          '/tmp': 'rw,noexec,nosuid,size=100m',
        },
      },
    };

    const container = await docker.createContainer(containerOptions);

    // Set auto-stop timeout
    if (timeout > 0) {
      setTimeout(async () => {
        try {
          const info = await container.inspect();
          if (info.State.Running) {
            await container.stop({ t: 5 });
            app.log.info(`[Timeout] Container ${container.id.substring(0, 12)} stopped after ${timeout}ms`);
          }
        } catch (e: any) {
          // Container already removed or stopped
        }
      }, timeout);
    }

    containersCreated.inc();
    executionDuration.labels('container.create').observe((Date.now() - new Date(timestamp).getTime()) / 1000);

    await auditLog({
      timestamp,
      action: 'container.create',
      containerId: container.id,
      clientIp,
      details: { image: body.image, memory, cpus, timeout, networkMode: body.networkMode },
      status: 'success',
    });

    return reply.code(201).send({
      id: container.id,
      name: containerOptions.name,
      image: body.image,
      memory,
      cpus,
      timeout,
      status: 'created',
    });
  } catch (error: any) {
    containersErrors.labels('create').inc();

    await auditLog({
      timestamp,
      action: 'container.create',
      clientIp,
      status: 'failure',
      error: error.message,
    });

    if (error instanceof z.ZodError) {
      return reply.code(400).send({ error: 'Validation error', details: error.errors });
    }

    return reply.code(500).send({ error: 'Container creation failed', message: error.message });
  }
});

/**
 * POST /exec/container/:id/start
 * Start a container
 */
app.post('/exec/container/:id/start', {
  preHandler: [(app as any).authenticate],
}, async (request, reply) => {
  const { id } = request.params as { id: string };
  const clientIp = request.ip;
  const timestamp = new Date().toISOString();

  try {
    const container = docker.getContainer(id);
    await container.start();

    await auditLog({
      timestamp,
      action: 'container.start',
      containerId: id,
      clientIp,
      status: 'success',
    });

    return reply.send({ id, status: 'started' });
  } catch (error: any) {
    await auditLog({
      timestamp,
      action: 'container.start',
      containerId: id,
      clientIp,
      status: 'failure',
      error: error.message,
    });

    if (error.statusCode === 304) {
      return reply.send({ id, status: 'already_running' });
    }

    return reply.code(500).send({ error: 'Container start failed', message: error.message });
  }
});

/**
 * POST /exec/container/:id/stop
 * Stop a container
 */
app.post('/exec/container/:id/stop', {
  preHandler: [(app as any).authenticate],
}, async (request, reply) => {
  const { id } = request.params as { id: string };
  const clientIp = request.ip;
  const timestamp = new Date().toISOString();

  try {
    const container = docker.getContainer(id);
    await container.stop({ t: 10 });

    await auditLog({
      timestamp,
      action: 'container.stop',
      containerId: id,
      clientIp,
      status: 'success',
    });

    return reply.send({ id, status: 'stopped' });
  } catch (error: any) {
    await auditLog({
      timestamp,
      action: 'container.stop',
      containerId: id,
      clientIp,
      status: 'failure',
      error: error.message,
    });

    if (error.statusCode === 304) {
      return reply.send({ id, status: 'already_stopped' });
    }

    return reply.code(500).send({ error: 'Container stop failed', message: error.message });
  }
});

/**
 * DELETE /exec/container/:id
 * Remove a container (force)
 */
app.delete('/exec/container/:id', {
  preHandler: [(app as any).authenticate],
}, async (request, reply) => {
  const { id } = request.params as { id: string };
  const clientIp = request.ip;
  const timestamp = new Date().toISOString();

  try {
    const container = docker.getContainer(id);
    
    // Try to stop first if running
    try {
      await container.stop({ t: 5 });
    } catch {
      // Already stopped
    }

    await container.remove({ force: true });

    containersRemoved.inc();

    await auditLog({
      timestamp,
      action: 'container.remove',
      containerId: id,
      clientIp,
      status: 'success',
    });

    return reply.send({ id, status: 'removed' });
  } catch (error: any) {
    containersErrors.labels('remove').inc();

    await auditLog({
      timestamp,
      action: 'container.remove',
      containerId: id,
      clientIp,
      status: 'failure',
      error: error.message,
    });

    return reply.code(500).send({ error: 'Container removal failed', message: error.message });
  }
});

/**
 * GET /exec/container/:id/logs
 * Get container logs
 */
app.get('/exec/container/:id/logs', {
  preHandler: [(app as any).authenticate],
}, async (request, reply) => {
  const { id } = request.params as { id: string };
  const clientIp = request.ip;
  const timestamp = new Date().toISOString();

  try {
    const container = docker.getContainer(id);
    const logs = await container.logs({
      stdout: true,
      stderr: true,
      tail: 200,
      timestamps: true,
    });

    // Docker logs are in a special format with headers - clean them
    const logsStr = typeof logs === 'string' 
      ? logs 
      : logs.toString('utf-8').replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, '');

    await auditLog({
      timestamp,
      action: 'container.logs',
      containerId: id,
      clientIp,
      status: 'success',
    });

    return reply.send({ id, logs: logsStr });
  } catch (error: any) {
    await auditLog({
      timestamp,
      action: 'container.logs',
      containerId: id,
      clientIp,
      status: 'failure',
      error: error.message,
    });

    return reply.code(500).send({ error: 'Log retrieval failed', message: error.message });
  }
});

/**
 * GET /exec/container/:id/stats
 * Get container resource usage stats
 */
app.get('/exec/container/:id/stats', {
  preHandler: [(app as any).authenticate],
}, async (request, reply) => {
  const { id } = request.params as { id: string };

  try {
    const container = docker.getContainer(id);
    const stats = await container.stats({ stream: false });

    return reply.send({
      id,
      memory: {
        usage: stats.memory_stats?.usage || 0,
        limit: stats.memory_stats?.limit || 0,
        usageMB: ((stats.memory_stats?.usage || 0) / 1024 / 1024).toFixed(2),
        limitMB: ((stats.memory_stats?.limit || 0) / 1024 / 1024).toFixed(2),
      },
      cpu: {
        cpuDelta: (stats.cpu_stats?.cpu_usage?.total_usage || 0) - (stats.precpu_stats?.cpu_usage?.total_usage || 0),
        systemDelta: (stats.cpu_stats?.system_cpu_usage || 0) - (stats.precpu_stats?.system_cpu_usage || 0),
        onlineCpus: stats.cpu_stats?.online_cpus || 0,
      },
      network: stats.networks || {},
    });
  } catch (error: any) {
    return reply.code(500).send({ error: 'Stats retrieval failed', message: error.message });
  }
});

/**
 * GET /exec/container/:id/inspect
 * Get container details
 */
app.get('/exec/container/:id/inspect', {
  preHandler: [(app as any).authenticate],
}, async (request, reply) => {
  const { id } = request.params as { id: string };

  try {
    const container = docker.getContainer(id);
    const info = await container.inspect();

    return reply.send({
      id: info.Id,
      name: info.Name,
      state: info.State,
      config: {
        Image: info.Config.Image,
        Cmd: info.Config.Cmd,
        Env: info.Config.Env,
        Labels: info.Config.Labels,
      },
      created: info.Created,
    });
  } catch (error: any) {
    return reply.code(500).send({ error: 'Inspect failed', message: error.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// SANDBOX ENDPOINTS (pre-configured templates)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * POST /exec/sandbox/create
 * Create a pre-configured sandbox from a template
 */
app.post('/exec/sandbox/create', {
  preHandler: [(app as any).authenticate],
}, async (request, reply) => {
  const clientIp = request.ip;
  const timestamp = new Date().toISOString();

  try {
    const body = createSandboxSchema.parse(request.body);
    const image = TEMPLATE_IMAGES[body.template] || 'node:18-alpine';
    const memory = body.memory || DEFAULT_MEMORY;
    const cpus = body.cpus || DEFAULT_CPUS;
    const timeout = body.timeout || DEFAULT_TIMEOUT;
    const networkMode = body.networkMode || 'none';

    // Enforce max limits
    const memoryBytes = Math.min(parseMemoryToBytes(memory), parseMemoryToBytes(MAX_MEMORY));
    const cpuQuota = Math.min(cpus, MAX_CPUS) * 100000;

    const sandboxId = `sandbox-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

    // Ensure image exists
    try {
      await docker.getImage(image).inspect();
    } catch {
      app.log.info(`[Sandbox] Pulling image ${image}...`);
      await new Promise<void>((resolve, reject) => {
        docker.pull(image, (err: Error | null, stream: NodeJS.ReadableStream) => {
          if (err) return reject(err);
          docker.modem.followProgress(stream, (err: Error | null) => {
            if (err) return reject(err);
            resolve();
          });
        });
      });
    }

    const container = await docker.createContainer({
      Image: image,
      name: sandboxId,
      Cmd: ['tail', '-f', '/dev/null'],
      Env: body.env || [],
      Labels: {
        'aenews.type': 'sandbox',
        'aenews.managed': 'true',
        'aenews.template': body.template,
        'aenews.timeout': timeout.toString(),
        'aenews.createdAt': timestamp,
        ...(body.labels || {}),
      },
      HostConfig: {
        Memory: memoryBytes,
        CpuQuota: cpuQuota,
        CpuPeriod: 100000,
        CapDrop: ['ALL'],
        SecurityOpt: ['no-new-privileges'],
        NetworkMode: networkMode,
        AutoRemove: false,
        PidsLimit: 100,
        Tmpfs: {
          '/tmp': 'rw,noexec,nosuid,size=100m',
        },
      },
    });

    // Start the container
    await container.start();

    // Set auto-stop timeout
    if (timeout > 0) {
      setTimeout(async () => {
        try {
          const info = await container.inspect();
          if (info.State.Running) {
            await container.stop({ t: 5 });
            app.log.info(`[Sandbox-Timeout] ${sandboxId} stopped after ${timeout}ms`);
          }
        } catch {
          // Container already removed or stopped
        }
      }, timeout);
    }

    sandboxesCreated.labels(body.template).inc();

    await auditLog({
      timestamp,
      action: 'sandbox.create',
      containerId: container.id,
      clientIp,
      details: { template: body.template, image, memory, cpus, timeout, networkMode },
      status: 'success',
    });

    return reply.code(201).send({
      id: container.id,
      name: sandboxId,
      template: body.template,
      image,
      memory,
      cpus,
      timeout,
      networkMode,
      status: 'running',
    });
  } catch (error: any) {
    sandboxesErrors.inc();

    await auditLog({
      timestamp,
      action: 'sandbox.create',
      clientIp,
      status: 'failure',
      error: error.message,
    });

    if (error instanceof z.ZodError) {
      return reply.code(400).send({ error: 'Validation error', details: error.errors });
    }

    return reply.code(500).send({ error: 'Sandbox creation failed', message: error.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// LIST ENDPOINTS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * GET /exec/containers
 * List managed containers
 */
app.get('/exec/containers', {
  preHandler: [(app as any).authenticate],
}, async (request, reply) => {
  try {
    const containers = await docker.listContainers({
      all: true,
      filters: { label: ['aenews.managed=true'] },
    });

    const result = containers.map((c) => ({
      id: c.Id,
      name: c.Names[0]?.replace(/^\//, '') || '',
      image: c.Image,
      state: c.State,
      status: c.Status,
      template: c.Labels?.['aenews.template'] || '',
      type: c.Labels?.['aenews.type'] || '',
      createdAt: c.Labels?.['aenews.createdAt'] || '',
    }));

    return reply.send({ containers: result, count: result.length });
  } catch (error: any) {
    return reply.code(500).send({ error: 'Container listing failed', message: error.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// NETWORK ENDPOINTS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * POST /exec/network/create
 * Create an isolated Docker network
 */
app.post('/exec/network/create', {
  preHandler: [(app as any).authenticate],
}, async (request, reply) => {
  const body = request.body as { name?: string; internal?: boolean };
  const clientIp = request.ip;
  const timestamp = new Date().toISOString();

  try {
    const name = body.name || `sandbox-net-${Date.now()}`;
    const internal = body.internal !== false; // default true

    const network = await docker.createNetwork({
      Name: name,
      Driver: 'bridge',
      Internal: internal,
      EnableIPv6: false,
      Labels: {
        'aenews.type': 'sandbox-network',
        'aenews.managed': 'true',
      },
    });

    await auditLog({
      timestamp,
      action: 'network.create',
      containerId: network.id,
      clientIp,
      details: { name, internal },
      status: 'success',
    });

    return reply.code(201).send({
      id: network.id,
      name,
      internal,
      status: 'created',
    });
  } catch (error: any) {
    await auditLog({
      timestamp,
      action: 'network.create',
      clientIp,
      status: 'failure',
      error: error.message,
    });

    return reply.code(500).send({ error: 'Network creation failed', message: error.message });
  }
});

/**
 * DELETE /exec/network/:id
 * Remove a Docker network
 */
app.delete('/exec/network/:id', {
  preHandler: [(app as any).authenticate],
}, async (request, reply) => {
  const { id } = request.params as { id: string };

  try {
    const network = docker.getNetwork(id);
    await network.remove();

    return reply.send({ id, status: 'removed' });
  } catch (error: any) {
    return reply.code(500).send({ error: 'Network removal failed', message: error.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// MAINTENANCE ENDPOINTS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * POST /exec/prune
 * Prune stopped containers and dangling images
 */
app.post('/exec/prune', {
  preHandler: [(app as any).authenticate],
}, async (request, reply) => {
  try {
    const containerPrune = await docker.pruneContainers({
      filters: { label: ['aenews.managed=true'] },
    });

    const imagePrune = await docker.pruneImages({
      filters: { dangling: { true: true } },
    });

    return reply.send({
      containersPruned: containerPrune.ContainersDeleted?.length || 0,
      spaceReclaimedMB: ((containerPrune.SpaceReclaimed || 0) / 1024 / 1024).toFixed(2),
      imagesPruned: imagePrune.ImagesDeleted?.length || 0,
      imageSpaceReclaimedMB: ((imagePrune.SpaceReclaimed || 0) / 1024 / 1024).toFixed(2),
    });
  } catch (error: any) {
    return reply.code(500).send({ error: 'Prune failed', message: error.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// EXEC ENDPOINT (run command in container)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * POST /exec/container/:id/exec
 * Execute a command inside a running container
 */
app.post('/exec/container/:id/exec', {
  preHandler: [(app as any).authenticate],
}, async (request, reply) => {
  const { id } = request.params as { id: string };
  const body = request.body as { cmd: string[]; env?: string[]; workdir?: string; user?: string };
  const clientIp = request.ip;
  const timestamp = new Date().toISOString();

  try {
    if (!body.cmd || !Array.isArray(body.cmd)) {
      return reply.code(400).send({ error: 'cmd array is required' });
    }

    const container = docker.getContainer(id);
    const exec = await container.exec({
      Cmd: body.cmd,
      AttachStdout: true,
      AttachStderr: true,
      Env: body.env || [],
      WorkingDir: body.workdir,
      User: body.user,
    });

    const stream = await exec.start({ Detach: false });
    
    let stdout = '';
    let stderr = '';

    // Parse Docker multiplexed stream
    await new Promise<void>((resolve) => {
      stream.on('data', (chunk: Buffer) => {
        // Docker stream format: 8-byte header (stream type + padding) + payload
        if (chunk.length > 8) {
          const streamType = chunk[0]; // 1=stdout, 2=stderr
          const payload = chunk.slice(8).toString('utf-8');
          if (streamType === 1) {
            stdout += payload;
          } else if (streamType === 2) {
            stderr += payload;
          }
        }
      });
      stream.on('end', resolve);
    });

    await auditLog({
      timestamp,
      action: 'container.exec',
      containerId: id,
      clientIp,
      details: { cmd: body.cmd },
      status: 'success',
    });

    return reply.send({ id, stdout, stderr, exitCode: 0 });
  } catch (error: any) {
    await auditLog({
      timestamp,
      action: 'container.exec',
      containerId: id,
      clientIp,
      status: 'failure',
      error: error.message,
    });

    return reply.code(500).send({ error: 'Exec failed', message: error.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// START SERVER
// ═══════════════════════════════════════════════════════════════════════════

async function start() {
  try {
    // Connect Redis
    if (redis) {
      await redis.connect().catch(() => {});
    }

    // Verify Docker connectivity
    await docker.ping();
    app.log.info('[Docker] Connected successfully');

    // Start server
    await app.listen({ port: PORT, host: '0.0.0.0' });
    app.log.info(`[ExecutionService] Listening on port ${PORT}`);
    app.log.info(`[ExecutionService] Environment: ${NODE_ENV}`);
    app.log.info(`[ExecutionService] JWT auth: enabled`);
  } catch (error: any) {
    app.log.error({ error: error.message }, '[ExecutionService] Failed to start');
    process.exit(1);
  }
}

start();

// Graceful shutdown
process.on('SIGTERM', async () => {
  app.log.info('[ExecutionService] SIGTERM received, shutting down...');
  await app.close();
  if (redis) await redis.quit();
  process.exit(0);
});

process.on('SIGINT', async () => {
  app.log.info('[ExecutionService] SIGINT received, shutting down...');
  await app.close();
  if (redis) await redis.quit();
  process.exit(0);
});
