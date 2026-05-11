/**
 * Health Routes Integration Tests
 *
 * Uses Fastify's inject() method — no real HTTP server or external dependencies.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';

// ─── Mock external dependencies (hoisted by vitest) ────────────────────────

vi.mock('../../config/env.js', () => ({
  env: {
    REDIS_URL: 'redis://localhost:6379',
    JWT_SECRET: 'test-secret',
    OPENAI_API_KEY: 'sk-test',
    ANTHROPIC_API_KEY: 'sk-test',
    CORS_ORIGINS: 'http://localhost:3000',
    FRONTEND_URL: 'http://localhost:3000',
    NODE_ENV: 'test',
  },
}));

vi.mock('../../config/logger.js', () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn(), fatal: vi.fn() },
}));

vi.mock('../../observability/metrics.js', () => ({
  metricsRegistry: { register: vi.fn() },
}));

const mockRedisPing = vi.fn().mockResolvedValue('PONG');
vi.mock('../../services/redis.service.js', () => ({
  getRedis: () => ({
    ping: () => mockRedisPing(),
  }),
}));

const mockQueryRaw = vi.fn().mockResolvedValue([{ '?column?': 1 }]);
vi.mock('../../config/prisma.js', () => ({
  prisma: {
    $queryRaw: (...args: any[]) => mockQueryRaw(...args),
  },
}));

const mockGetJobCounts = vi.fn().mockResolvedValue({
  active: 0,
  waiting: 0,
  failed: 0,
  completed: 5,
});
vi.mock('../../workers/index.js', () => ({
  getProjectQueue: () => ({
    getJobCounts: () => mockGetJobCounts(),
  }),
}));

// ─── Import health routes after mocks ───────────────────────────────────────

import { healthRoutes } from '../health.routes.js';

// ─── Helpers ────────────────────────────────────────────────────────────────

async function buildApp() {
  const app = Fastify();
  await app.register(healthRoutes);
  return app;
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('Health Routes', () => {
  let app: Fastify.FastifyInstance;

  beforeEach(async () => {
    app = await buildApp();
    // Reset all mocks to default (healthy) state
    mockRedisPing.mockResolvedValue('PONG');
    mockQueryRaw.mockResolvedValue([{ '?column?': 1 }]);
    mockGetJobCounts.mockResolvedValue({
      active: 0,
      waiting: 0,
      failed: 0,
      completed: 5,
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // GET /
  // ═══════════════════════════════════════════════════════════════════════════
  describe('GET /', () => {
    // 1. GET / returns 200 when all services healthy
    it('should return 200 when all services are healthy', async () => {
      const res = await app.inject({ method: 'GET', url: '/' });
      expect(res.statusCode).toBe(200);
    });

    // 2. GET / returns correct structure
    it('should return correct response structure', async () => {
      const res = await app.inject({ method: 'GET', url: '/' });
      const body = res.json();

      expect(body).toHaveProperty('status');
      expect(body).toHaveProperty('timestamp');
      expect(body).toHaveProperty('uptime');
      expect(body).toHaveProperty('services');
      expect(body).toHaveProperty('version');

      expect(typeof body.status).toBe('string');
      expect(typeof body.timestamp).toBe('string');
      expect(typeof body.uptime).toBe('number');
      expect(typeof body.services).toBe('object');
    });

    // 3. GET / returns version '3.0.0'
    it('should return version "3.0.0"', async () => {
      const res = await app.inject({ method: 'GET', url: '/' });
      expect(res.json().version).toBe('3.0.0');
    });

    // 4. GET / returns 503 when redis is down
    it('should return 503 when redis is down', async () => {
      mockRedisPing.mockRejectedValue(new Error('Connection refused'));

      const res = await app.inject({ method: 'GET', url: '/' });
      expect(res.statusCode).toBe(503);
      expect(res.json().status).toBe('unhealthy');
      expect(res.json().services.redis).toBe('down');
    });

    // 5. GET / returns 503 when database is down
    it('should return 503 when database is down', async () => {
      mockQueryRaw.mockRejectedValue(new Error('Connection refused'));

      const res = await app.inject({ method: 'GET', url: '/' });
      expect(res.statusCode).toBe(503);
      expect(res.json().status).toBe('unhealthy');
      expect(res.json().services.database).toBe('down');
    });

    // 6. GET / returns 503 when queue is down
    it('should return 503 when queue is down', async () => {
      mockGetJobCounts.mockRejectedValue(new Error('Connection refused'));

      const res = await app.inject({ method: 'GET', url: '/' });
      expect(res.statusCode).toBe(503);
      expect(res.json().status).toBe('unhealthy');
      expect(res.json().services.queue).toBe('down');
    });

    // Services should contain api = 'up' always
    it('should always report api service as up', async () => {
      const res = await app.inject({ method: 'GET', url: '/' });
      expect(res.json().services.api).toBe('up');
    });

    // Queue stats should be included when queue is up
    it('should include queueStats when queue is healthy', async () => {
      const res = await app.inject({ method: 'GET', url: '/' });
      expect(res.json().services.queueStats).toBeDefined();
      expect(res.json().services.queueStats.completed).toBe(5);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // GET /detailed
  // ═══════════════════════════════════════════════════════════════════════════
  describe('GET /detailed', () => {
    // 7. GET /detailed returns memory usage info
    it('should return memory usage information', async () => {
      const res = await app.inject({ method: 'GET', url: '/detailed' });
      const body = res.json();

      expect(body.system).toBeDefined();
      expect(body.system.memory).toBeDefined();
      expect(body.system.memory.rss).toMatch(/\d+MB/);
      expect(body.system.memory.heapUsed).toMatch(/\d+MB/);
      expect(body.system.memory.heapTotal).toMatch(/\d+MB/);
    });

    // 8. GET /detailed returns latency for each service
    it('should return latency for each service', async () => {
      const res = await app.inject({ method: 'GET', url: '/detailed' });
      const body = res.json();

      expect(body.checks.redis).toBeDefined();
      expect(body.checks.redis.status).toBe('up');
      expect(typeof body.checks.redis.latency).toBe('number');

      expect(body.checks.database).toBeDefined();
      expect(body.checks.database.status).toBe('up');
      expect(typeof body.checks.database.latency).toBe('number');
    });

    // 9. GET /detailed returns 200 even if some services have latency issues
    it('should return 200 even if some services have high latency', async () => {
      // Simulate slow redis (no actual delay, just check response code)
      mockRedisPing.mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve('PONG'), 2))
      );

      const res = await app.inject({ method: 'GET', url: '/detailed' });
      expect(res.statusCode).toBe(200);
      expect(res.json().status).toBe('ok');
    });

    // GET /detailed returns CPU usage
    it('should return CPU usage info', async () => {
      const res = await app.inject({ method: 'GET', url: '/detailed' });
      const body = res.json();

      expect(body.system.cpu).toBeDefined();
      expect(body.system).toHaveProperty('uptime');
    });

    // GET /detailed returns responseTime
    it('should return responseTime', async () => {
      const res = await app.inject({ method: 'GET', url: '/detailed' });
      expect(res.json().responseTime).toBeDefined();
      expect(typeof res.json().responseTime).toBe('number');
    });

    // GET /detailed handles service failures gracefully
    it('should return error details when a service is down', async () => {
      mockRedisPing.mockRejectedValue(new Error('ECONNREFUSED'));

      const res = await app.inject({ method: 'GET', url: '/detailed' });
      expect(res.statusCode).toBe(200);
      expect(res.json().checks.redis.status).toBe('down');
      expect(res.json().checks.redis.error).toBeDefined();
    });
  });
});
