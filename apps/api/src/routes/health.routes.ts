/**
 * Health Check Routes
 * Real service health checks: Redis, PostgreSQL, BullMQ Queue
 */

import type { FastifyInstance } from 'fastify';
import { getRedis } from '../services/redis.service.js';
import { prisma } from '../config/prisma.js';
import { getProjectQueue } from '../workers/index.js';

export async function healthRoutes(app: FastifyInstance) {
  app.get('/', async (request, reply) => {
    const services: Record<string, string> = {};
    let unhealthy = false;

    // Check Redis
    try {
      const redis = getRedis();
      await redis.ping();
      services.redis = 'up';
    } catch {
      services.redis = 'down';
      unhealthy = true;
    }

    // Check PostgreSQL (REAL check)
    try {
      await prisma.$queryRaw`SELECT 1`;
      services.database = 'up';
    } catch {
      services.database = 'down';
      unhealthy = true;
    }

    // Check BullMQ Queue
    try {
      const queue = getProjectQueue();
      const counts = await queue.getJobCounts('active', 'waiting', 'failed', 'completed');
      services.queue = 'up';
      (services as Record<string, unknown>).queueStats = counts;
    } catch {
      services.queue = 'down';
      unhealthy = true;
    }

    // Always up
    services.api = 'up';

    const status = unhealthy ? 'unhealthy' : 'healthy';
    const statusCode = unhealthy ? 503 : 200;

    return reply.status(statusCode).send({
      status,
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      services,
      version: '3.1.0',
    });
  });

  // Detailed health endpoint (for monitoring)
  app.get('/detailed', async (request, reply) => {
    const startTime = Date.now();
    const checks: Record<string, { status: string; latency?: number; error?: string }> = {};

    // Redis latency
    try {
      const redis = getRedis();
      const start = Date.now();
      await redis.ping();
      checks.redis = { status: 'up', latency: Date.now() - start };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      checks.redis = { status: 'down', error: message };
    }

    // PostgreSQL latency
    try {
      const start = Date.now();
      await prisma.$queryRaw`SELECT 1`;
      checks.database = { status: 'up', latency: Date.now() - start };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      checks.database = { status: 'down', error: message };
    }

    // Memory usage
    const memUsage = process.memoryUsage();

    return reply.send({
      status: 'ok',
      timestamp: new Date().toISOString(),
      responseTime: Date.now() - startTime,
      checks,
      system: {
        memory: {
          rss: Math.round(memUsage.rss / 1024 / 1024) + 'MB',
          heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024) + 'MB',
          heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024) + 'MB',
        },
        cpu: process.cpuUsage(),
        uptime: process.uptime(),
      },
    });
  });
}
