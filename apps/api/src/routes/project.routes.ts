/**
 * Project Routes
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { getProjectQueue } from '../workers/index.js';
import type { ProjectJob } from '../workers/index.js';

const createProjectSchema = z.object({
  prompt: z.string().min(10).max(2000),
  name: z.string().min(3).max(100),
});

export async function projectRoutes(app: FastifyInstance) {
  // Create project
  app.post('/', {
    onRequest: [app.authenticate],
  }, async (request, reply) => {
    const body = createProjectSchema.parse(request.body);
    const user = request.user as any;

    const projectId = `prj_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const job: ProjectJob = {
      projectId,
      userId: user.userId,
      prompt: body.prompt,
      state: 'INIT',
      context: {},
      retryCount: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const queue = getProjectQueue();
    await queue.add(projectId, job);

    return reply.send({
      success: true,
      projectId,
      message: 'Project created and queued for processing',
    });
  });

  // Get project status
  app.get('/:projectId', {
    onRequest: [app.authenticate],
  }, async (request, reply) => {
    const { projectId } = request.params as { projectId: string };
    const queue = getProjectQueue();

    const job = await queue.getJob(projectId);
    
    if (!job) {
      return reply.status(404).send({
        error: 'Not Found',
        message: 'Project not found',
      });
    }

    const state = await job.getState();
    const progress = await job.progress;

    return reply.send({
      projectId,
      state: job.data.state,
      jobState: state,
      progress,
      context: job.data.context,
      createdAt: job.data.createdAt,
      updatedAt: job.data.updatedAt,
    });
  });

  // List user projects
  app.get('/', {
    onRequest: [app.authenticate],
  }, async (request, reply) => {
    // TODO: Implement with Prisma
    return reply.send({
      projects: [],
    });
  });

  // Delete project
  app.delete('/:projectId', {
    onRequest: [app.authenticate],
  }, async (request, reply) => {
    const { projectId } = request.params as { projectId: string };
    const queue = getProjectQueue();

    const job = await queue.getJob(projectId);
    
    if (job) {
      await job.remove();
    }

    return reply.send({
      success: true,
      message: 'Project deleted',
    });
  });
}
