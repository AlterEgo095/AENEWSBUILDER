/**
 * Admin Routes - AENEWS BUILDER Platform Administration API
 *
 * Comprehensive admin endpoints for dashboard metrics, user management,
 * project oversight, job control, cost analytics, MCP tool catalog,
 * queue operations, sandbox monitoring, and platform settings.
 *
 * @module routes/admin
 */

import type { FastifyInstance } from 'fastify';
import type { Job } from 'bullmq';
import { prisma } from '../config/prisma.js';
import { getRedis } from '../services/redis.service.js';
import { logger } from '../config/logger.js';
import { getProjectQueue } from '../workers/index.js';
import type { ProjectJob } from '../workers/index.js';
import { eventStoreV2 } from '../workers/event-store-v2.js';
import { warmPool } from '../sandbox/warm-pool.js';
import { CostTracker } from '../workers/cost-tracker.js';
import { mcpCatalog } from '@aenews/mcp';

// ── Redis hash key for platform settings ──────────────────────────────────────
const SETTINGS_KEY = 'aenews:settings';

// ── Default platform settings ─────────────────────────────────────────────────
const DEFAULT_SETTINGS: Record<string, string> = {
  maxProjectsPerUser: '10',
  maxDailyCost: '10',
  sandboxPoolSize: '3',
  workerConcurrency: '5',
  autoHealingEnabled: 'true',
  mcpToolsEnabled: 'true',
  registrationEnabled: 'true',
  maintenanceMode: 'false',
  allowedOrigins: '',
  costAlertEmail: '',
};

// ── Helper: parse pagination query parameters ─────────────────────────────────
function parsePagination(query: any): { page: number; limit: number; skip: number } {
  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));
  return { page, limit, skip: (page - 1) * limit };
}

// ── Helper: build standard paginated response ─────────────────────────────────
function paginatedResponse<T>(items: T[], total: number, page: number, limit: number) {
  return {
    data: items,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
      hasNext: page * limit < total,
      hasPrev: page > 1,
    },
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// 🔐 ADMIN ROUTES
// ═══════════════════════════════════════════════════════════════════════════════

export async function adminRoutes(app: FastifyInstance) {

  // ──────────────────────────────────────────────────────────────────────────
  // 📊 DASHBOARD METRICS
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * GET /admin/metrics
   * Comprehensive dashboard metrics including user/project counts,
   * daily project trend (30 days), system health, queue stats, and
   * sandbox warm-pool metrics.
   */
  app.get('/metrics', {
    onRequest: [(app as any).authenticate],
    preHandler: [(app as any).authorizeAdmin],
  }, async (request, reply) => {
    try {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      // Core counts
      const [
        totalUsers,
        totalProjects,
        completedProjects,
        failedProjects,
        dailyProjects,
      ] = await Promise.all([
        prisma.user.count(),
        prisma.project.count(),
        prisma.project.count({ where: { state: 'DONE' } }),
        prisma.project.count({ where: { state: 'FAILED' } }),
        // Daily projects over last 30 days (PostgreSQL)
        prisma.$queryRawUnsafe<Array<{ date: string; count: bigint }>>(`
          SELECT DATE("createdAt") AS date, COUNT(*)::bigint AS count
          FROM projects
          WHERE "createdAt" >= $1
          GROUP BY DATE("createdAt")
          ORDER BY date ASC
        `, thirtyDaysAgo),
      ]);

      const totalResolved = completedProjects + failedProjects;
      const successRate = totalResolved > 0
        ? Math.round((completedProjects / totalResolved) * 10000) / 100
        : 0;

      // System health checks
      const health: Record<string, any> = {};

      try {
        const redis = getRedis();
        const start = Date.now();
        await redis.ping();
        health.redis = { status: 'up', latencyMs: Date.now() - start };
      } catch {
        health.redis = { status: 'down', latencyMs: -1 };
      }

      try {
        const start = Date.now();
        await prisma.$queryRaw`SELECT 1`;
        health.database = { status: 'up', latencyMs: Date.now() - start };
      } catch {
        health.database = { status: 'down', latencyMs: -1 };
      }

      // Queue stats from BullMQ
      let queueStats: Record<string, number> = {};
      let activeJobs = 0;
      try {
        const queue = getProjectQueue();
        queueStats = await queue.getJobCounts(
          'active', 'waiting', 'completed', 'failed', 'delayed'
        );
        activeJobs = queueStats.active || 0;
      } catch {
        queueStats = { error: 1 };
      }

      // Sandbox warm-pool metrics
      let sandboxMetrics: any = {};
      try {
        sandboxMetrics = warmPool.getMetrics();
      } catch {
        sandboxMetrics = { error: 'warm pool unavailable' };
      }

      return reply.send({
        timestamp: new Date().toISOString(),
        overview: {
          totalUsers,
          totalProjects,
          completedProjects,
          failedProjects,
          successRate,
          activeJobs,
        },
        dailyProjects: dailyProjects.map((row) => ({
          date: row.date,
          count: Number(row.count),
        })),
        systemHealth: health,
        queueStats,
        sandboxMetrics,
      });
    } catch (error: any) {
      logger.error({ error }, 'Admin metrics failed');
      return reply.status(500).send({ error: 'Failed to fetch metrics', message: error.message });
    }
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 👤 USER MANAGEMENT
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * GET /admin/users
   * List all users with pagination, search filtering, and optional role filter.
   * Includes per-user project count and aggregated cost.
   */
  app.get('/users', {
    onRequest: [(app as any).authenticate],
    preHandler: [(app as any).authorizeAdmin],
  }, async (request, reply) => {
    try {
      const query = request.query as any;
      const { page, limit, skip } = parsePagination(query);
      const search = (query.search as string | undefined)?.trim();
      const role = (query.role as string | undefined)?.trim();

      // Build Prisma where clause
      const where: any = {};
      if (search) {
        where.OR = [
          { email: { contains: search, mode: 'insensitive' } },
          { name: { contains: search, mode: 'insensitive' } },
        ];
      }

      const [users, total] = await Promise.all([
        prisma.user.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip,
          take: limit,
          select: {
            id: true,
            email: true,
            name: true,
            createdAt: true,
            updatedAt: true,
            _count: { select: { projects: true } },
          },
        }),
        prisma.user.count({ where }),
      ]);

      // Aggregate total cost per user from CostRecord
      const userCosts = await prisma.costRecord.groupBy({
        by: ['projectId'],
        _sum: { cost: true },
      });

      // Map projectId → total cost
      const projectCostMap = new Map<string, number>();
      for (const uc of userCosts) {
        if (uc.projectId && uc._sum.cost) {
          projectCostMap.set(uc.projectId, uc._sum.cost);
        }
      }

      // Enrich user list with cost
      const projectIds = users.map((u) => u.id);
      const projectCostsByUser = await prisma.project.groupBy({
        by: ['userId'],
        where: { userId: { in: projectIds } },
        _sum: { id: true }, // just to have grouping
      });

      // Build projectId → userId mapping
      const projectOwnerMap = await prisma.project.findMany({
        where: { userId: { in: projectIds } },
        select: { id: true, userId: true },
      });
      const pidToUid = new Map(projectOwnerMap.map((p) => [p.id, p.userId]));

      // Summarise cost per user
      const userTotalCost = new Map<string, number>();
      for (const [pid, cost] of projectCostMap.entries()) {
        const uid = pidToUid.get(pid);
        if (uid) {
          userTotalCost.set(uid, (userTotalCost.get(uid) || 0) + cost);
        }
      }

      const data = users.map((u) => ({
        id: u.id,
        email: u.email,
        name: u.name,
        projectCount: u._count.projects,
        totalCost: userTotalCost.get(u.id) || 0,
        createdAt: u.createdAt,
        updatedAt: u.updatedAt,
      }));

      return reply.send(paginatedResponse(data, total, page, limit));
    } catch (error: any) {
      logger.error({ error }, 'Admin list users failed');
      return reply.status(500).send({ error: 'Failed to list users', message: error.message });
    }
  });

  /**
   * GET /admin/users/:id
   * Get detailed information for a single user including project list
   * and aggregated statistics.
   */
  app.get('/users/:id', {
    onRequest: [(app as any).authenticate],
    preHandler: [(app as any).authorizeAdmin],
  }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };

      const user = await prisma.user.findUnique({
        where: { id },
        select: {
          id: true,
          email: true,
          name: true,
          createdAt: true,
          updatedAt: true,
          _count: { select: { projects: true } },
        },
      });

      if (!user) {
        return reply.status(404).send({ error: 'User not found' });
      }

      // Per-user cost aggregation via CostRecord → Project
      const projectIds = (
        await prisma.project.findMany({ where: { userId: id }, select: { id: true } })
      ).map((p) => p.id);

      let totalCost = 0;
      if (projectIds.length > 0) {
        const costSum = await prisma.costRecord.aggregate({
          where: { projectId: { in: projectIds } },
          _sum: { cost: true },
        });
        totalCost = costSum._sum.cost || 0;
      }

      // Project state breakdown
      const stateBreakdown = await prisma.project.groupBy({
        by: ['state'],
        where: { userId: id },
        _count: true,
      });

      return reply.send({
        ...user,
        totalCost,
        projectStates: Object.fromEntries(
          stateBreakdown.map((s) => [s.state, s._count])
        ),
      });
    } catch (error: any) {
      logger.error({ error, userId: (request.params as any).id }, 'Admin get user failed');
      return reply.status(500).send({ error: 'Failed to get user', message: error.message });
    }
  });

  /**
   * PUT /admin/users/:id
   * Update user fields: name, role (stored in context / metadata), or ban status.
   */
  app.put('/users/:id', {
    onRequest: [(app as any).authenticate],
    preHandler: [(app as any).authorizeAdmin],
  }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const body = request.body as any;

      const user = await prisma.user.findUnique({ where: { id } });
      if (!user) {
        return reply.status(404).send({ error: 'User not found' });
      }

      // Build update payload — only allowed fields
      const updateData: any = {};
      if (typeof body.name === 'string' && body.name.trim().length >= 2) {
        updateData.name = body.name.trim();
      }

      // Ban/unban: use a Redis key so it doesn't require schema migration
      if (body.banned === true || body.banned === false) {
        const redis = getRedis();
        if (body.banned) {
          await redis.set(`user:banned:${id}`, '1', 'EX', 86400 * 365);
        } else {
          await redis.del(`user:banned:${id}`);
        }
      }

      // Role storage in Redis (schema does not have a role column)
      if (body.role && ['admin', 'user', 'moderator'].includes(body.role)) {
        const redis = getRedis();
        await redis.hset(`user:${id}:meta`, 'role', body.role);
      }

      if (Object.keys(updateData).length > 0) {
        await prisma.user.update({ where: { id }, data: updateData });
      }

      // Fetch updated user
      const updated = await prisma.user.findUnique({
        where: { id },
        select: { id: true, email: true, name: true, createdAt: true, updatedAt: true },
      });

      return reply.send({ success: true, user: updated });
    } catch (error: any) {
      logger.error({ error, userId: (request.params as any).id }, 'Admin update user failed');
      return reply.status(500).send({ error: 'Failed to update user', message: error.message });
    }
  });

  /**
   * DELETE /admin/users/:id
   * Delete a user and all associated projects (cascade via foreign key).
   */
  app.delete('/users/:id', {
    onRequest: [(app as any).authenticate],
    preHandler: [(app as any).authorizeAdmin],
  }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };

      const user = await prisma.user.findUnique({ where: { id } });
      if (!user) {
        return reply.status(404).send({ error: 'User not found' });
      }

      // Cascade delete will remove projects, events, and cost records
      await prisma.user.delete({ where: { id } });

      // Clean up Redis metadata
      try {
        const redis = getRedis();
        await redis.del(`user:banned:${id}`, `user:${id}:meta`);
      } catch {
        // Redis cleanup is best-effort
      }

      logger.info({ userId: id }, 'Admin deleted user');
      return reply.send({ success: true, message: 'User deleted' });
    } catch (error: any) {
      logger.error({ error, userId: (request.params as any).id }, 'Admin delete user failed');
      return reply.status(500).send({ error: 'Failed to delete user', message: error.message });
    }
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 📁 PROJECT MANAGEMENT
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * GET /admin/projects
   * List all projects with pagination, status filter, user filter, and search.
   * Includes user name, file count (from context), and total cost.
   */
  app.get('/projects', {
    onRequest: [(app as any).authenticate],
    preHandler: [(app as any).authorizeAdmin],
  }, async (request, reply) => {
    try {
      const query = request.query as any;
      const { page, limit, skip } = parsePagination(query);
      const status = query.status as string | undefined;
      const userId = query.userId as string | undefined;
      const search = (query.search as string | undefined)?.trim();

      const where: any = {};
      if (status) where.state = status;
      if (userId) where.userId = userId;
      if (search) {
        where.OR = [
          { name: { contains: search, mode: 'insensitive' } },
          { prompt: { contains: search, mode: 'insensitive' } },
        ];
      }

      const [projects, total] = await Promise.all([
        prisma.project.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip,
          take: limit,
          select: {
            id: true,
            name: true,
            prompt: true,
            state: true,
            deployUrl: true,
            createdAt: true,
            updatedAt: true,
            userId: true,
            user: { select: { name: true, email: true } },
            context: true,
            _count: { select: { events: true, costRecords: true } },
          },
        }),
        prisma.project.count({ where }),
      ]);

      // Aggregate cost per project
      const projectIds = projects.map((p) => p.id);
      const costSums = await prisma.costRecord.groupBy({
        by: ['projectId'],
        where: projectIds.length > 0 ? { projectId: { in: projectIds } } : undefined,
        _sum: { cost: true },
      });
      const costMap = new Map(costSums.map((c) => [c.projectId, c._sum.cost || 0]));

      // Count files from context JSON (where files key may exist)
      const data = projects.map((p) => ({
        id: p.id,
        name: p.name,
        prompt: p.prompt,
        state: p.state,
        deployUrl: p.deployUrl,
        createdAt: p.createdAt,
        updatedAt: p.updatedAt,
        user: p.user,
        eventCount: p._count.events,
        costRecordCount: p._count.costRecords,
        totalCost: costMap.get(p.id) || 0,
        fileCount: Object.keys(
          (p.context as Record<string, any>)?.files || {}
        ).length,
      }));

      return reply.send(paginatedResponse(data, total, page, limit));
    } catch (error: any) {
      logger.error({ error }, 'Admin list projects failed');
      return reply.status(500).send({ error: 'Failed to list projects', message: error.message });
    }
  });

  /**
   * GET /admin/projects/:id
   * Get detailed project information including the full event timeline.
   */
  app.get('/projects/:id', {
    onRequest: [(app as any).authenticate],
    preHandler: [(app as any).authorizeAdmin],
  }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };

      const project = await prisma.project.findUnique({
        where: { id },
        include: {
          user: { select: { id: true, name: true, email: true } },
          events: {
            orderBy: { timestamp: 'asc' },
            take: 500,
          },
          costRecords: {
            orderBy: { timestamp: 'desc' },
            take: 100,
          },
        },
      });

      if (!project) {
        return reply.status(404).send({ error: 'Project not found' });
      }

      // Aggregate cost
      const totalCost = project.costRecords.reduce(
        (sum, r) => sum + r.cost, 0
      );
      const totalTokens = project.costRecords.reduce(
        (sum, r) => sum + (r.tokens || 0), 0
      );

      return reply.send({
        id: project.id,
        name: project.name,
        prompt: project.prompt,
        state: project.state,
        context: project.context,
        deployUrl: project.deployUrl,
        user: project.user,
        createdAt: project.createdAt,
        updatedAt: project.updatedAt,
        stats: {
          eventCount: project.events.length,
          totalCost,
          totalTokens,
        },
        events: project.events,
        costRecords: project.costRecords,
      });
    } catch (error: any) {
      logger.error({ error, projectId: (request.params as any).id }, 'Admin get project failed');
      return reply.status(500).send({ error: 'Failed to get project', message: error.message });
    }
  });

  /**
   * DELETE /admin/projects/:id
   * Delete a project and all associated events / cost records (cascade).
   */
  app.delete('/projects/:id', {
    onRequest: [(app as any).authenticate],
    preHandler: [(app as any).authorizeAdmin],
  }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };

      const project = await prisma.project.findUnique({ where: { id } });
      if (!project) {
        return reply.status(404).send({ error: 'Project not found' });
      }

      // Remove from BullMQ queue if present
      try {
        const queue = getProjectQueue();
        const job = await queue.getJob(id);
        if (job) await job.remove();
      } catch {
        // Queue may be unavailable — non-fatal
      }

      // Cascade delete (events + cost records)
      await prisma.project.delete({ where: { id } });

      logger.info({ projectId: id }, 'Admin deleted project');
      return reply.send({ success: true, message: 'Project deleted' });
    } catch (error: any) {
      logger.error({ error, projectId: (request.params as any).id }, 'Admin delete project failed');
      return reply.status(500).send({ error: 'Failed to delete project', message: error.message });
    }
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 🔄 JOB MANAGEMENT (BullMQ)
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * GET /admin/jobs
   * List BullMQ jobs with pagination, state filter, and project filter.
   * Returns job metadata including project name, progress, and timestamps.
   */
  app.get('/jobs', {
    onRequest: [(app as any).authenticate],
    preHandler: [(app as any).authorizeAdmin],
  }, async (request, reply) => {
    try {
      const query = request.query as any;
      const { page, limit, skip } = parsePagination(query);
      const state = query.state as string | undefined;
      const projectId = query.projectId as string | undefined;

      const queue = getProjectQueue();

      // BullMQ provides getJobs by type/status
      const jobTypes = state
        ? [state as any]
        : ['active', 'waiting', 'completed', 'failed', 'delayed'] as any[];

      const allJobs: Job<ProjectJob>[] = [];
      for (const type of jobTypes) {
        try {
          const jobs = await queue.getJobs(type, skip, limit + 100);
          allJobs.push(...jobs);
        } catch {
          // Some statuses may have no jobs
        }
      }

      // Apply client-side filtering for projectId and pagination
      let filtered = allJobs;
      if (projectId) {
        filtered = filtered.filter((j) => j.data?.projectId === projectId);
      }
      filtered = filtered.sort((a, b) => {
        const ta = a.timestamp ? new Date(a.timestamp).getTime() : 0;
        const tb = b.timestamp ? new Date(b.timestamp).getTime() : 0;
        return tb - ta; // newest first
      });

      const total = filtered.length;
      const paged = filtered.slice(skip, skip + limit);

      // Enrich with project name
      const projectIds = [...new Set(paged.map((j) => j.data?.projectId).filter(Boolean))];
      const projects = projectIds.length > 0
        ? await prisma.project.findMany({
            where: { id: { in: projectIds } },
            select: { id: true, name: true },
          })
        : [];
      const projectNameMap = new Map(projects.map((p) => [p.id, p.name]));

      const data = await Promise.all(
        paged.map(async (job) => {
          const jobState = await job.getState();
          return {
            id: job.id,
            name: job.name,
            state: jobState,
            progress: job.progress,
            projectId: job.data?.projectId || null,
            projectName: projectNameMap.get(job.data?.projectId) || null,
            userId: job.data?.userId || null,
            attemptsMade: job.attemptsMade,
            failedReason: job.failedReason || null,
            timestamp: job.timestamp ? new Date(job.timestamp) : null,
            processedOn: job.processedOn ? new Date(job.processedOn) : null,
            finishedOn: job.finishedOn ? new Date(job.finishedOn) : null,
          };
        })
      );

      return reply.send(paginatedResponse(data, total, page, limit));
    } catch (error: any) {
      logger.error({ error }, 'Admin list jobs failed');
      return reply.status(500).send({ error: 'Failed to list jobs', message: error.message });
    }
  });

  /**
   * POST /admin/jobs/:id/retry
   * Retry a failed BullMQ job.
   */
  app.post('/jobs/:id/retry', {
    onRequest: [(app as any).authenticate],
    preHandler: [(app as any).authorizeAdmin],
  }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };

      const queue = getProjectQueue();
      const job = await queue.getJob(id);

      if (!job) {
        return reply.status(404).send({ error: 'Job not found' });
      }

      await job.retry();

      logger.info({ jobId: id }, 'Admin retried job');
      return reply.send({ success: true, message: 'Job retrying', jobId: id });
    } catch (error: any) {
      logger.error({ error, jobId: (request.params as any).id }, 'Admin retry job failed');
      return reply.status(500).send({ error: 'Failed to retry job', message: error.message });
    }
  });

  /**
   * DELETE /admin/jobs/:id
   * Remove a BullMQ job from the queue.
   */
  app.delete('/jobs/:id', {
    onRequest: [(app as any).authenticate],
    preHandler: [(app as any).authorizeAdmin],
  }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };

      const queue = getProjectQueue();
      const job = await queue.getJob(id);

      if (!job) {
        return reply.status(404).send({ error: 'Job not found' });
      }

      const state = await job.getState();
      if (state === 'active') {
        return reply.status(409).send({
          error: 'Cannot remove active job',
          message: 'Wait for the job to finish or fail before removing it.',
        });
      }

      await job.remove();

      logger.info({ jobId: id, previousState: state }, 'Admin removed job');
      return reply.send({ success: true, message: 'Job removed', jobId: id });
    } catch (error: any) {
      logger.error({ error, jobId: (request.params as any).id }, 'Admin remove job failed');
      return reply.status(500).send({ error: 'Failed to remove job', message: error.message });
    }
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 📋 EVENTS
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * GET /admin/events
   * Query workflow events from PostgreSQL via the Event Store V2.
   * Supports filtering by project, event type, and date range.
   */
  app.get('/events', {
    onRequest: [(app as any).authenticate],
    preHandler: [(app as any).authorizeAdmin],
  }, async (request, reply) => {
    try {
      const query = request.query as any;

      const filter: any = {};
      if (query.projectId) filter.projectId = query.projectId;
      if (query.type) filter.types = String(query.type).split(',').filter(Boolean);
      if (query.from) filter.from = new Date(query.from);
      if (query.to) filter.to = new Date(query.to);
      filter.limit = Math.min(Number(query.limit) || 100, 1000);

      const events = await eventStoreV2.getEvents(filter);

      return reply.send({
        success: true,
        count: events.length,
        events,
      });
    } catch (error: any) {
      logger.error({ error }, 'Admin query events failed');
      return reply.status(500).send({ error: 'Failed to query events', message: error.message });
    }
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 💰 COST ANALYTICS
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * GET /admin/costs
   * Cost analytics with aggregation by day, model, or operation.
   * Queries the CostRecord table in PostgreSQL.
   */
  app.get('/costs', {
    onRequest: [(app as any).authenticate],
    preHandler: [(app as any).authorizeAdmin],
  }, async (request, reply) => {
    try {
      const query = request.query as any;
      const from = query.from ? new Date(query.from) : new Date(Date.now() - 30 * 86400000);
      const to = query.to ? new Date(query.to) : new Date();
      const groupBy = query.groupBy || 'day';

      const baseWhere: any = {
        timestamp: { gte: from, lte: to },
      };

      // Daily cost aggregation
      const dailyCosts = await prisma.costRecord.groupBy({
        by: ['timestamp'],
        where: baseWhere,
        _sum: { cost: true, tokens: true },
        _count: true,
      });

      // Group by day
      const dailyMap = new Map<string, { cost: number; tokens: number; count: number }>();
      for (const row of dailyCosts) {
        const day = new Date(row.timestamp).toISOString().split('T')[0];
        const existing = dailyMap.get(day) || { cost: 0, tokens: 0, count: 0 };
        existing.cost += row._sum.cost || 0;
        existing.tokens += row._sum.tokens || 0;
        existing.count += row._count;
        dailyMap.set(day, existing);
      }
      const daily = Array.from(dailyMap.entries())
        .map(([date, agg]) => ({ date, ...agg }))
        .sort((a, b) => a.date.localeCompare(b.date));

      // Cost by operation
      const byOperation = await prisma.costRecord.groupBy({
        by: ['operation'],
        where: baseWhere,
        _sum: { cost: true, tokens: true },
        _count: true,
      });

      // Cost by model — extracted from operation field pattern "operation:model"
      const byModelRaw = await prisma.costRecord.findMany({
        where: baseWhere,
        select: { operation: true, cost: true, tokens: true },
      });
      const modelMap = new Map<string, { cost: number; tokens: number; count: number }>();
      for (const record of byModelRaw) {
        const parts = record.operation.split(':');
        const model = parts.length > 1 ? parts[parts.length - 1] : 'unknown';
        const existing = modelMap.get(model) || { cost: 0, tokens: 0, count: 0 };
        existing.cost += record.cost;
        existing.tokens += record.tokens || 0;
        existing.count += 1;
        modelMap.set(model, existing);
      }
      const byModel = Array.from(modelMap.entries())
        .map(([model, agg]) => ({ model, ...agg }))
        .sort((a, b) => b.cost - a.cost);

      // Total summary
      const totalAgg = await prisma.costRecord.aggregate({
        where: baseWhere,
        _sum: { cost: true, tokens: true },
        _count: true,
      });

      let result: any = {
        period: { from, to },
        total: {
          cost: totalAgg._sum.cost || 0,
          tokens: totalAgg._sum.tokens || 0,
          records: totalAgg._count,
        },
        daily,
        byOperation: byOperation.map((row) => ({
          operation: row.operation,
          cost: row._sum.cost || 0,
          tokens: row._sum.tokens || 0,
          count: row._count,
        })),
        byModel,
      };

      // If groupBy is specified, elevate that grouping
      if (groupBy === 'day') result.primary = daily;
      else if (groupBy === 'operation') result.primary = byOperation;
      else if (groupBy === 'model') result.primary = byModel;

      return reply.send(result);
    } catch (error: any) {
      logger.error({ error }, 'Admin cost analytics failed');
      return reply.status(500).send({ error: 'Failed to fetch costs', message: error.message });
    }
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 🔧 MCP TOOL CATALOG
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * GET /admin/mcp/tools
   * List all MCP tools from the platform catalog with their current
   * enabled/disabled state (stored in Redis).
   */
  app.get('/mcp/tools', {
    onRequest: [(app as any).authenticate],
    preHandler: [(app as any).authorizeAdmin],
  }, async (request, reply) => {
    try {
      const redis = getRedis();

      // Get enabled/disabled overrides from Redis
      const toolStates = await redis.hgetall('aenews:mcp:tool-states');

      const tools = mcpCatalog.map((entry) => ({
        id: entry.id,
        name: entry.name,
        version: entry.version,
        author: entry.author,
        category: entry.category,
        description: entry.description,
        source: entry.source,
        permissions: entry.permissions,
        envVars: entry.envVars,
        tags: entry.tags,
        status: entry.status,
        enabled: toolStates[entry.id] !== 'disabled', // enabled by default
      }));

      // Group by category
      const grouped = tools.reduce<Record<string, typeof tools>>((acc, tool) => {
        if (!acc[tool.category]) acc[tool.category] = [];
        acc[tool.category].push(tool);
        return acc;
      }, {});

      return reply.send({
        total: tools.length,
        enabled: tools.filter((t) => t.enabled).length,
        disabled: tools.filter((t) => !t.enabled).length,
        categories: grouped,
      });
    } catch (error: any) {
      logger.error({ error }, 'Admin MCP tools list failed');
      return reply.status(500).send({ error: 'Failed to list MCP tools', message: error.message });
    }
  });

  /**
   * PUT /admin/mcp/tools/:id
   * Enable or disable an MCP tool by updating the Redis state.
   */
  app.put('/mcp/tools/:id', {
    onRequest: [(app as any).authenticate],
    preHandler: [(app as any).authorizeAdmin],
  }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const body = request.body as { enabled?: boolean };

      if (typeof body.enabled !== 'boolean') {
        return reply.status(400).send({
          error: 'Validation error',
          message: 'Body must include a boolean "enabled" field.',
        });
      }

      // Verify tool exists in catalog
      const tool = mcpCatalog.find((t) => t.id === id);
      if (!tool) {
        return reply.status(404).send({ error: 'MCP tool not found' });
      }

      const redis = getRedis();
      await redis.hset(
        'aenews:mcp:tool-states',
        id,
        body.enabled ? 'enabled' : 'disabled'
      );

      logger.info({ toolId: id, enabled: body.enabled }, 'Admin updated MCP tool state');

      return reply.send({
        success: true,
        toolId: id,
        enabled: body.enabled,
        message: body.enabled ? 'Tool enabled' : 'Tool disabled',
      });
    } catch (error: any) {
      logger.error({ error, toolId: (request.params as any).id }, 'Admin MCP tool update failed');
      return reply.status(500).send({ error: 'Failed to update MCP tool', message: error.message });
    }
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 📡 QUEUE OPERATIONS
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * GET /admin/queue/stats
   * Real-time queue statistics from BullMQ.
   */
  app.get('/queue/stats', {
    onRequest: [(app as any).authenticate],
    preHandler: [(app as any).authorizeAdmin],
  }, async (request, reply) => {
    try {
      const queue = getProjectQueue();

      const [counts, isPaused] = await Promise.all([
        queue.getJobCounts('active', 'waiting', 'completed', 'failed', 'delayed', 'waiting-children', 'prioritized'),
        queue.isPaused(),
      ]);

      return reply.send({
        timestamp: new Date().toISOString(),
        paused: isPaused,
        counts: {
          active: counts.active || 0,
          waiting: counts.waiting || 0,
          completed: counts.completed || 0,
          failed: counts.failed || 0,
          delayed: counts.delayed || 0,
          waitingChildren: counts['waiting-children'] || 0,
          prioritized: counts.prioritized || 0,
        },
        totalPending: (counts.active || 0) + (counts.waiting || 0) + (counts.delayed || 0),
      });
    } catch (error: any) {
      logger.error({ error }, 'Admin queue stats failed');
      return reply.status(500).send({ error: 'Failed to fetch queue stats', message: error.message });
    }
  });

  /**
   * POST /admin/queue/clear-failed
   * Remove all failed jobs from the BullMQ queue.
   */
  app.post('/queue/clear-failed', {
    onRequest: [(app as any).authenticate],
    preHandler: [(app as any).authorizeAdmin],
  }, async (request, reply) => {
    try {
      const queue = getProjectQueue();

      const failedJobs = await queue.getJobs('failed', 0, 10_000);
      let removed = 0;

      for (const job of failedJobs) {
        try {
          await job.remove();
          removed++;
        } catch {
          // Some jobs may already have been removed
        }
      }

      logger.info({ removed, total: failedJobs.length }, 'Admin cleared failed jobs');
      return reply.send({
        success: true,
        removed,
        total: failedJobs.length,
        message: `Removed ${removed} failed jobs`,
      });
    } catch (error: any) {
      logger.error({ error }, 'Admin clear failed jobs failed');
      return reply.status(500).send({ error: 'Failed to clear failed jobs', message: error.message });
    }
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 🐳 SANDBOX MONITORING
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * GET /admin/sandbox/metrics
   * Sandbox warm-pool metrics including pool size, availability,
   * queue depth, saturation, and predicted demand.
   */
  app.get('/sandbox/metrics', {
    onRequest: [(app as any).authenticate],
    preHandler: [(app as any).authorizeAdmin],
  }, async (request, reply) => {
    try {
      const metrics = warmPool.getMetrics();

      return reply.send({
        timestamp: new Date().toISOString(),
        ...metrics,
      });
    } catch (error: any) {
      logger.error({ error }, 'Admin sandbox metrics failed');
      return reply.status(500).send({ error: 'Failed to fetch sandbox metrics', message: error.message });
    }
  });

  /**
   * GET /admin/sandbox/health
   * Detailed sandbox health including pool metrics, circuit breaker state,
   * Docker daemon status, and memory stats for each container.
   */
  app.get('/sandbox/health', {
    onRequest: [(app as any).authenticate],
    preHandler: [(app as any).authorizeAdmin],
  }, async (request, reply) => {
    try {
      const metrics = warmPool.getMetrics();

      // Build a health summary
      const isHealthy = metrics.total > 0 && metrics.saturationPercent < 90;

      return reply.send({
        timestamp: new Date().toISOString(),
        healthy: isHealthy,
        metrics,
        details: {
          poolUtilization: `${metrics.busy}/${metrics.total} containers busy`,
          queueBacklog: metrics.queueDepth,
          waitTimeAvgMs: Math.round(metrics.avgWaitTimeMs),
          saturationPercent: metrics.saturationPercent.toFixed(1) + '%',
          predictedDemand: metrics.predictedDemand,
          rejectionRate: metrics.rejectionRate.toFixed(2) + '%',
          recommendations: metrics.saturationPercent > 80
            ? ['Consider scaling up the sandbox pool']
            : metrics.queueDepth > 10
              ? ['Waiting queue is growing — monitor closely']
              : ['All systems nominal'],
        },
      });
    } catch (error: any) {
      logger.error({ error }, 'Admin sandbox health failed');
      return reply.status(500).send({ error: 'Failed to fetch sandbox health', message: error.message });
    }
  });

  // ──────────────────────────────────────────────────────────────────────────
  // ⚙️ PLATFORM SETTINGS
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * GET /admin/settings
   * Retrieve platform settings from a Redis hash.
   * Falls back to defaults for any missing keys.
   */
  app.get('/settings', {
    onRequest: [(app as any).authenticate],
    preHandler: [(app as any).authorizeAdmin],
  }, async (request, reply) => {
    try {
      const redis = getRedis();
      const stored = await redis.hgetall(SETTINGS_KEY);

      // Merge stored values over defaults
      const settings: Record<string, string> = { ...DEFAULT_SETTINGS };
      for (const [key, value] of Object.entries(stored)) {
        settings[key] = value;
      }

      return reply.send({
        settings,
        source: 'redis',
        key: SETTINGS_KEY,
      });
    } catch (error: any) {
      logger.error({ error }, 'Admin get settings failed');
      return reply.status(500).send({ error: 'Failed to fetch settings', message: error.message });
    }
  });

  /**
   * PUT /admin/settings
   * Update one or more platform settings in the Redis hash.
   * Only known keys are accepted to prevent key-value pollution.
   */
  app.put('/settings', {
    onRequest: [(app as any).authenticate],
    preHandler: [(app as any).authorizeAdmin],
  }, async (request, reply) => {
    try {
      const body = request.body as Record<string, string>;

      if (!body || typeof body !== 'object' || Array.isArray(body)) {
        return reply.status(400).send({
          error: 'Validation error',
          message: 'Body must be a JSON object of setting key-value pairs.',
        });
      }

      const allowedKeys = new Set(Object.keys(DEFAULT_SETTINGS));
      const updates: string[] = [];
      const rejected: string[] = [];

      for (const [key, value] of Object.entries(body)) {
        if (!allowedKeys.has(key)) {
          rejected.push(key);
          continue;
        }
        if (typeof value !== 'string') {
          rejected.push(key);
          continue;
        }
        updates.push(key);
      }

      if (updates.length > 0) {
        const redis = getRedis();
        // Build flat array for hmset: [key1, val1, key2, val2, ...]
        const flatEntries: string[] = [];
        for (const key of updates) {
          flatEntries.push(key, body[key]);
        }
        await redis.hmset(SETTINGS_KEY, ...flatEntries);
      }

      logger.info({ updated: updates, rejected }, 'Admin updated settings');

      return reply.send({
        success: true,
        updated: updates,
        rejected,
        message: updates.length > 0
          ? `Updated ${updates.length} setting(s)`
          : 'No valid settings to update',
      });
    } catch (error: any) {
      logger.error({ error }, 'Admin update settings failed');
      return reply.status(500).send({ error: 'Failed to update settings', message: error.message });
    }
  });
}
