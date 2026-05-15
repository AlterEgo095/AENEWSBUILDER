/**
 * Recovery Routes - Admin-only project recovery endpoints
 * 
 * POST /api/recovery/failed    - Reset and re-queue FAILED projects
 * GET  /api/recovery/status    - Get recovery status
 */

import type { FastifyInstance } from 'fastify';
import { prisma } from '../config/prisma.js';
import { logger } from '../config/logger.js';
import { projectQueue } from '../queue/project-queue.js';

export async function recoveryRoutes(app: FastifyInstance) {

  // GET /api/recovery/status — Get failed projects summary
  app.get('/status', {
    onRequest: [(app as any).authenticate, (app as any).authorizeAdmin],
  }, async (request, reply) => {
    try {
      const failedCount = await prisma.project.count({
        where: { state: 'FAILED' },
      });

      const initCount = await prisma.project.count({
        where: { state: 'INIT' },
      });

      const doneCount = await prisma.project.count({
        where: { state: 'DONE' },
      });

      const total = await prisma.project.count();

      return reply.send({
        success: true,
        summary: {
          total,
          failed: failedCount,
          init: initCount,
          done: doneCount,
          successRate: total > 0 ? ((doneCount / total) * 100).toFixed(1) : '0',
        },
      });
    } catch (error: any) {
      logger.error({ error: error.message }, '[Recovery] Status failed');
      return reply.status(500).send({ success: false, error: error.message });
    }
  });

  // POST /api/recovery/failed — Reset and re-queue FAILED projects
  app.post('/failed', {
    onRequest: [(app as any).authenticate, (app as any).authorizeAdmin],
  }, async (request, reply) => {
    try {
      const body = request.body as { limit?: number; dryRun?: boolean } | undefined;
      const limit = body?.limit || 100;
      const dryRun = body?.dryRun || false;

      // Find FAILED projects
      const failedProjects = await prisma.project.findMany({
        where: { state: 'FAILED' },
        orderBy: { createdAt: 'desc' },
        take: limit,
      });

      if (failedProjects.length === 0) {
        return reply.send({
          success: true,
          message: 'No failed projects to recover',
          recovered: 0,
          queued: 0,
        });
      }

      if (dryRun) {
        return reply.send({
          success: true,
          message: 'Dry run — no changes made',
          projects: failedProjects.map((p: any) => ({ id: p.id, name: p.name, createdAt: p.createdAt })),
          wouldRecover: failedProjects.length,
        });
      }

      // Reset and re-queue
      let recovered = 0;
      let queued = 0;
      const errors: string[] = [];

      for (const project of failedProjects) {
        try {
          // Reset state to INIT
          await prisma.project.update({
            where: { id: project.id },
            data: {
              state: 'INIT',
              context: {},
              updatedAt: new Date(),
            },
          });
          recovered++;

          // Re-queue the project for generation
          await projectQueue.addJob({
            projectId: project.id,
            userId: project.userId,
            prompt: project.prompt,
            options: {},
            priority: 3,
          });
          queued++;

          logger.info(`[Recovery] Reset and re-queued: ${project.id} (${project.name})`);
        } catch (error: any) {
          errors.push(`${project.id}: ${error.message}`);
          logger.error(`[Recovery] Failed for ${project.id}: ${error.message}`);
        }
      }

      return reply.send({
        success: true,
        message: `Recovered ${recovered} projects, ${queued} re-queued`,
        recovered,
        queued,
        errors: errors.length > 0 ? errors : undefined,
      });

    } catch (error: any) {
      logger.error({ error: error.message }, '[Recovery] Failed project reset failed');
      return reply.status(500).send({ success: false, error: error.message });
    }
  });
}
