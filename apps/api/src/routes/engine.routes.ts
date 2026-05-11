/**
 * Security & Context API Routes
 */

import type { FastifyInstance } from 'fastify';
import { securityEngine } from '../services/security-engine.js';
import { contextMemory } from '../services/context-memory.js';
import { planVersioning } from '../services/plan-versioning.js';

export async function engineRoutes(app: FastifyInstance) {
  // ============================================
  // SECURITY SCAN
  // ============================================

  // Scan a single file
  app.post('/security/scan', {
    onRequest: [(app as any).authenticate],
  }, async (request, reply) => {
    const { filePath, content } = request.body as { filePath: string; content: string };

    if (!filePath || !content) {
      return reply.status(400).send({ error: 'filePath and content are required' });
    }

    const result = await securityEngine.scanFile(filePath, content);
    return reply.send(result);
  });

  // Scan a full project
  app.post('/security/scan-project', {
    onRequest: [(app as any).authenticate],
  }, async (request, reply) => {
    const { files } = request.body as { files: Record<string, string> };

    if (!files || Object.keys(files).length === 0) {
      return reply.status(400).send({ error: 'files object is required' });
    }

    const result = await securityEngine.scanProject(files);
    return reply.send(result);
  });

  // ============================================
  // CONTEXT MEMORY
  // ============================================

  // Get project context
  app.get('/context/:projectId', {
    onRequest: [(app as any).authenticate],
  }, async (request, reply) => {
    const { projectId } = request.params as { projectId: string };
    const context = await contextMemory.getProjectContext(projectId);

    if (!context) {
      return reply.status(404).send({ error: 'Project context not found' });
    }

    return reply.send(context);
  });

  // Find similar projects
  app.post('/context/similar', {
    onRequest: [(app as any).authenticate],
  }, async (request, reply) => {
    const { prompt, limit } = request.body as { prompt: string; limit?: number };
    const similar = await contextMemory.findSimilarProjects(prompt, limit || 5);
    return reply.send({ projects: similar });
  });

  // Get cross-project learnings
  app.get('/context/learnings/:type', {
    onRequest: [(app as any).authenticate],
  }, async (request, reply) => {
    const { type } = request.params as { type: string };
    const learnings = await contextMemory.getCrossProjectLearnings(type);
    return reply.send({ type, learnings });
  });

  // ============================================
  // PLAN VERSIONING
  // ============================================

  // Get plan history
  app.get('/plans/:projectId/history', {
    onRequest: [(app as any).authenticate],
  }, async (request, reply) => {
    const { projectId } = request.params as { projectId: string };
    const history = await planVersioning.getPlanHistory(projectId);
    return reply.send({ projectId, versions: history });
  });

  // Get specific plan version
  app.get('/plans/:projectId/version/:version', {
    onRequest: [(app as any).authenticate],
  }, async (request, reply) => {
    const { projectId, version } = request.params as { projectId: string; version: string };
    const planVersion = await planVersioning.getPlanVersion(projectId, parseInt(version));

    if (!planVersion) {
      return reply.status(404).send({ error: 'Plan version not found' });
    }

    return reply.send(planVersion);
  });

  // Get latest plan
  app.get('/plans/:projectId/latest', {
    onRequest: [(app as any).authenticate],
  }, async (request, reply) => {
    const { projectId } = request.params as { projectId: string };
    const latest = await planVersioning.getLatestPlan(projectId);

    if (!latest) {
      return reply.status(404).send({ error: 'No plan found' });
    }

    return reply.send(latest);
  });

  // Compare two plan versions
  app.get('/plans/:projectId/compare/:versionA/:versionB', {
    onRequest: [(app as any).authenticate],
  }, async (request, reply) => {
    const { projectId, versionA, versionB } = request.params as { projectId: string; versionA: string; versionB: string };
    const diff = await planVersioning.compareProjectPlans(projectId, parseInt(versionA), parseInt(versionB));
    return reply.send(diff);
  });
}
