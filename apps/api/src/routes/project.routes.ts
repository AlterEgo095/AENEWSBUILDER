/**
 * Project Routes - With Prisma database layer
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../config/prisma.js';
import { getProjectQueue } from '../workers/index.js';
import type { ProjectJob } from '../workers/index.js';

const createProjectSchema = z.object({
  prompt: z.string().min(10).max(2000),
  name: z.string().min(3).max(100),
});

export async function projectRoutes(app: FastifyInstance) {
  // Create project
  app.post('/', {
    onRequest: [(app as any).authenticate],
  }, async (request, reply) => {
    try {
      const body = createProjectSchema.parse(request.body);
      const user = request.user as any;

      const projectId = `prj_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      // Create project in database
      await prisma.project.create({
        data: {
          id: projectId,
          name: body.name,
          prompt: body.prompt,
          state: 'INIT',
          userId: user.id,
        },
      });

      // Queue the job for processing
      const job: ProjectJob = {
        projectId,
        userId: user.id,
        prompt: body.prompt,
        state: 'INIT',
        context: {},
        retryCount: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const queue = getProjectQueue();
      await queue.add(projectId, job);

      return reply.status(201).send({
        success: true,
        projectId,
        message: 'Project created and queued for processing',
      });
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({
          success: false,
          error: 'Validation error',
          details: error.errors,
        });
      }
      request.log.error({ error }, 'Failed to create project');
      return reply.status(500).send({
        success: false,
        error: 'Failed to create project',
      });
    }
  });

  // Get project status
  app.get('/:projectId', {
    onRequest: [(app as any).authenticate],
  }, async (request, reply) => {
    const { projectId } = request.params as { projectId: string };
    const user = request.user as any;

    // Check project belongs to user
    const project = await prisma.project.findFirst({
      where: { id: projectId, userId: user.id },
    });

    if (!project) {
      return reply.status(404).send({
        error: 'Not Found',
        message: 'Project not found',
      });
    }

    // Also check BullMQ job state for real-time progress
    try {
      const queue = getProjectQueue();
      const job = await queue.getJob(projectId);

      if (job) {
        const jobState = await job.getState();
        const progress = await job.progress;

        return reply.send({
          projectId: project.id,
          name: project.name,
          prompt: project.prompt,
          state: job.data.state || project.state,
          jobState,
          progress,
          context: job.data.context || project.context,
          deployUrl: project.deployUrl,
          createdAt: project.createdAt,
          updatedAt: project.updatedAt,
        });
      }
    } catch {
      // Queue might not be available, return DB data
    }

    return reply.send({
      projectId: project.id,
      name: project.name,
      prompt: project.prompt,
      state: project.state,
      jobState: 'unknown',
      progress: 0,
      context: project.context,
      deployUrl: project.deployUrl,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
    });
  });

  // List user projects
  app.get('/', {
    onRequest: [(app as any).authenticate],
  }, async (request, reply) => {
    const user = request.user as any;

    const projects = await prisma.project.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        prompt: true,
        state: true,
        deployUrl: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return reply.send({
      success: true,
      count: projects.length,
      projects,
    });
  });

  // Delete project
  app.delete('/:projectId', {
    onRequest: [(app as any).authenticate],
  }, async (request, reply) => {
    const { projectId } = request.params as { projectId: string };
    const user = request.user as any;

    // Check project belongs to user
    const project = await prisma.project.findFirst({
      where: { id: projectId, userId: user.id },
    });

    if (!project) {
      return reply.status(404).send({
        error: 'Not Found',
        message: 'Project not found',
      });
    }

    // Remove from BullMQ queue if exists
    try {
      const queue = getProjectQueue();
      const job = await queue.getJob(projectId);
      if (job) {
        await job.remove();
      }
    } catch {
      // Queue might not be available
    }

    // Delete from database (cascade will remove events and cost records)
    await prisma.project.delete({
      where: { id: projectId },
    });

    return reply.send({
      success: true,
      message: 'Project deleted',
    });
  });
}
