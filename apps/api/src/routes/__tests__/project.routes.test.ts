/**
 * Project Routes Integration Tests
 *
 * Uses Fastify's inject() method — no real HTTP server or external dependencies.
 * Tests project creation, retrieval, listing, and deletion.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';

// ─── Mock external dependencies (hoisted by vitest) ────────────────────────

vi.mock('../../config/env.js', () => ({
  env: {
    REDIS_URL: 'redis://localhost:6379',
    JWT_SECRET: 'test-secret-key-that-is-at-least-thirty-two-chars',
    OPENAI_API_KEY: 'sk-test',
    ANTHROPIC_API_KEY: 'sk-ant-test',
    CORS_ORIGINS: 'http://localhost:3000',
    FRONTEND_URL: 'http://localhost:3000',
    NODE_ENV: 'test',
  },
}));

vi.mock('../../config/logger.js', () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

// Mock Prisma
const mockPrismaProjectCreate = vi.fn();
const mockPrismaProjectFindFirst = vi.fn();
const mockPrismaProjectFindMany = vi.fn();
const mockPrismaProjectDelete = vi.fn();

vi.mock('../../config/prisma.js', () => ({
  prisma: {
    project: {
      create: (...args: any[]) => mockPrismaProjectCreate(...args),
      findFirst: (...args: any[]) => mockPrismaProjectFindFirst(...args),
      findMany: (...args: any[]) => mockPrismaProjectFindMany(...args),
      delete: (...args: any[]) => mockPrismaProjectDelete(...args),
    },
  },
}));

// Mock queue
const mockQueueAdd = vi.fn();
const mockQueueGetJob = vi.fn();

vi.mock('../../workers/index.js', () => ({
  getProjectQueue: () => ({
    add: (...args: any[]) => mockQueueAdd(...args),
    getJob: (...args: any[]) => mockQueueGetJob(...args),
  }),
}));

// ─── Import project routes after mocks ──────────────────────────────────────

import { projectRoutes } from '../project.routes.js';

// ─── Helpers ────────────────────────────────────────────────────────────────

let userId = 'user-1';
const JWT_SECRET = 'test-secret-key-that-is-at-least-thirty-two-chars';

function generateToken(userId: string): string {
  // Simple JWT-like token for testing (the real app uses @fastify/jwt)
  // We'll use the app's jwt.sign in buildApp
  return `test-token-for-${userId}`;
}

async function buildApp() {
  const app = Fastify();
  await app.register(import('@fastify/jwt'), { secret: JWT_SECRET });

  // Add authenticate decorator (used by project routes' onRequest hooks)
  app.decorate('authenticate', async function(request: any, reply: any) {
    try {
      await request.jwtVerify();
      // Map JWT sub claim to id for compatibility with route handlers
      request.user = { id: request.user.sub, email: request.user.email };
    } catch (err) {
      reply.send(err);
    }
  });

  // Register a dummy authenticate hook so the auth guards work
  if (!app.hasRequestDecorator('user')) {
    app.decorateRequest('user', null);
  }
  app.addHook('onRequest', async (request: any, reply) => {
    const authHeader = request.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      try {
        const decoded = await app.jwt.verify<{ sub: string; email: string }>(
          authHeader.replace('Bearer ', '')
        );
        request.user = { id: decoded.sub, email: decoded.email };
      } catch {
        // invalid token
      }
    }
  });

  await app.register(projectRoutes);
  return app;
}

async function getAuthHeader(app: Fastify.FastifyInstance, uid: string = 'user-1') {
  const token = app.jwt.sign({ sub: uid, email: 'user@example.com' });
  return { Authorization: `Bearer ${token}` };
}

const validCreateBody = {
  prompt: 'Build me a beautiful e-commerce store with cart and checkout',
  name: 'E-Commerce Store',
};

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('Project Routes', () => {
  let app: Fastify.FastifyInstance;
  let authHeaders: Record<string, string>;

  beforeEach(async () => {
    app = await buildApp();
    vi.clearAllMocks();

    authHeaders = await getAuthHeader(app);

    // Default: project creation succeeds
    mockPrismaProjectCreate.mockResolvedValue({
      id: 'prj-1',
      name: 'E-Commerce Store',
      prompt: 'Build me a beautiful e-commerce store',
      state: 'INIT',
      userId: 'user-1',
    });

    // Default: queue add succeeds
    mockQueueAdd.mockResolvedValue({ id: 'job-1' });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // POST / (create project)
  // ═══════════════════════════════════════════════════════════════════════════

  describe('POST /', () => {
    it('should return 201 with valid prompt and name', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/',
        headers: authHeaders,
        payload: validCreateBody,
      });

      expect(res.statusCode).toBe(201);
      expect(res.json().success).toBe(true);
    });

    it('should return 400 when prompt is too short (< 10 chars)', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/',
        headers: authHeaders,
        payload: { prompt: 'short', name: 'Test' },
      });

      expect(res.statusCode).toBe(400);
      expect(res.json().success).toBe(false);
      expect(res.json().error).toBe('Validation error');
    });

    it('should return 400 when name is too short (< 3 chars)', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/',
        headers: authHeaders,
        payload: { prompt: 'A valid prompt with at least 10 characters', name: 'AB' },
      });

      expect(res.statusCode).toBe(400);
      expect(res.json().success).toBe(false);
    });

    it('should create project in database', async () => {
      await app.inject({
        method: 'POST',
        url: '/',
        headers: authHeaders,
        payload: validCreateBody,
      });

      expect(mockPrismaProjectCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            name: 'E-Commerce Store',
            prompt: 'Build me a beautiful e-commerce store with cart and checkout',
            state: 'INIT',
            userId: 'user-1',
          }),
        })
      );
    });

    it('should queue job with correct data', async () => {
      await app.inject({
        method: 'POST',
        url: '/',
        headers: authHeaders,
        payload: validCreateBody,
      });

      expect(mockQueueAdd).toHaveBeenCalledWith(
        expect.any(String), // projectId (dynamic)
        expect.objectContaining({
          userId: 'user-1',
          prompt: 'Build me a beautiful e-commerce store with cart and checkout',
          state: 'INIT',
          retryCount: 0,
        })
      );
    });

    it('should return projectId in response', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/',
        headers: authHeaders,
        payload: validCreateBody,
      });

      const body = res.json();
      expect(body).toHaveProperty('projectId');
      expect(typeof body.projectId).toBe('string');
    });

    it('should return 401 without authentication', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/',
        payload: validCreateBody,
      });

      expect(res.statusCode).toBe(401);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // GET /:projectId
  // ═══════════════════════════════════════════════════════════════════════════

  describe('GET /:projectId', () => {
    it('should return project data for existing project', async () => {
      mockPrismaProjectFindFirst.mockResolvedValue({
        id: 'prj-1',
        name: 'E-Commerce Store',
        prompt: 'Build me a store',
        state: 'INIT',
        userId: 'user-1',
        context: null,
        deployUrl: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      // No queue job found
      mockQueueGetJob.mockResolvedValue(null);

      const res = await app.inject({
        method: 'GET',
        url: '/prj-1',
        headers: authHeaders,
      });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toHaveProperty('projectId', 'prj-1');
      expect(res.json()).toHaveProperty('name', 'E-Commerce Store');
    });

    it('should return 404 for unknown project', async () => {
      mockPrismaProjectFindFirst.mockResolvedValue(null);

      const res = await app.inject({
        method: 'GET',
        url: '/nonexistent-project',
        headers: authHeaders,
      });

      expect(res.statusCode).toBe(404);
      expect(res.json().error).toBe('Not Found');
    });

    it('should include queue job state when available', async () => {
      mockPrismaProjectFindFirst.mockResolvedValue({
        id: 'prj-1',
        name: 'Store',
        prompt: 'Build',
        state: 'INIT',
        userId: 'user-1',
        context: null,
        deployUrl: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      mockQueueGetJob.mockResolvedValue({
        id: 'prj-1',
        getState: vi.fn().mockResolvedValue('active'),
        progress: 45,
        data: {
          state: 'GENERATE',
          context: { files: { 'index.ts': '...' } },
        },
      });

      const res = await app.inject({
        method: 'GET',
        url: '/prj-1',
        headers: authHeaders,
      });

      expect(res.json().jobState).toBe('active');
      expect(res.json().progress).toBe(45);
    });

    it('should return jobState "unknown" when queue is unavailable', async () => {
      mockPrismaProjectFindFirst.mockResolvedValue({
        id: 'prj-1',
        name: 'Store',
        prompt: 'Build',
        state: 'INIT',
        userId: 'user-1',
        context: null,
        deployUrl: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      mockQueueGetJob.mockResolvedValue(null);

      const res = await app.inject({
        method: 'GET',
        url: '/prj-1',
        headers: authHeaders,
      });

      expect(res.json().jobState).toBe('unknown');
      expect(res.json().progress).toBe(0);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // GET / (list projects)
  // ═══════════════════════════════════════════════════════════════════════════

  describe('GET /', () => {
    it('should list user projects', async () => {
      const projects = [
        {
          id: 'prj-1',
          name: 'Store',
          prompt: 'Build a store',
          state: 'DONE',
          deployUrl: 'https://store.example.com',
          createdAt: '2024-01-01',
          updatedAt: '2024-01-02',
        },
        {
          id: 'prj-2',
          name: 'Blog',
          prompt: 'Build a blog',
          state: 'INIT',
          deployUrl: null,
          createdAt: '2024-01-03',
          updatedAt: '2024-01-03',
        },
      ];

      mockPrismaProjectFindMany.mockResolvedValue(projects);

      const res = await app.inject({
        method: 'GET',
        url: '/',
        headers: authHeaders,
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().success).toBe(true);
      expect(res.json().count).toBe(2);
      expect(res.json().projects).toHaveLength(2);
    });

    it('should return empty list for user with no projects', async () => {
      mockPrismaProjectFindMany.mockResolvedValue([]);

      const res = await app.inject({
        method: 'GET',
        url: '/',
        headers: authHeaders,
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().count).toBe(0);
      expect(res.json().projects).toHaveLength(0);
    });

    it('should return 401 without authentication', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/',
      });

      expect(res.statusCode).toBe(401);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // DELETE /:projectId
  // ═══════════════════════════════════════════════════════════════════════════

  describe('DELETE /:projectId', () => {
    it('should delete project', async () => {
      mockPrismaProjectFindFirst.mockResolvedValue({
        id: 'prj-1',
        userId: 'user-1',
      });

      mockPrismaProjectDelete.mockResolvedValue({ id: 'prj-1' });

      // No queue job
      mockQueueGetJob.mockResolvedValue(null);

      const res = await app.inject({
        method: 'DELETE',
        url: '/prj-1',
        headers: authHeaders,
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().success).toBe(true);
      expect(res.json().message).toBe('Project deleted');
    });

    it('should cancel queue job when deleting project', async () => {
      const mockJobRemove = vi.fn().mockResolvedValue(undefined);
      mockPrismaProjectFindFirst.mockResolvedValue({
        id: 'prj-1',
        userId: 'user-1',
      });

      mockQueueGetJob.mockResolvedValue({
        id: 'prj-1',
        remove: mockJobRemove,
      });

      mockPrismaProjectDelete.mockResolvedValue({ id: 'prj-1' });

      await app.inject({
        method: 'DELETE',
        url: '/prj-1',
        headers: authHeaders,
      });

      expect(mockJobRemove).toHaveBeenCalled();
    });

    it('should return 404 when project not found', async () => {
      mockPrismaProjectFindFirst.mockResolvedValue(null);

      const res = await app.inject({
        method: 'DELETE',
        url: '/nonexistent',
        headers: authHeaders,
      });

      expect(res.statusCode).toBe(404);
    });

    it('should delete project from database', async () => {
      mockPrismaProjectFindFirst.mockResolvedValue({
        id: 'prj-1',
        userId: 'user-1',
      });

      mockQueueGetJob.mockResolvedValue(null);
      mockPrismaProjectDelete.mockResolvedValue({ id: 'prj-1' });

      await app.inject({
        method: 'DELETE',
        url: '/prj-1',
        headers: authHeaders,
      });

      expect(mockPrismaProjectDelete).toHaveBeenCalledWith({
        where: { id: 'prj-1' },
      });
    });
  });
});
