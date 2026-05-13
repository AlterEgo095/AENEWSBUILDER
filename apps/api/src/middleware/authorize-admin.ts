/**
 * Admin Authorization Middleware
 *
 * Creates an authorizeAdmin hook that:
 * 1. First runs authenticate (JWT validation)
 * 2. Then checks the user's role via Redis cache or DB fallback
 * 3. Returns 403 if role !== 'admin'
 */

import type { FastifyInstance } from 'fastify';
import { prisma } from '../config/prisma.js';
import { getRedis } from '../services/redis.service.js';
import { logger } from '../config/logger.js';

/**
 * Build the authorizeAdmin preHandler hook for a given Fastify app.
 * Requires that `app.authenticate` has already been registered as a decorator.
 */
export function authorizeAdminHook(app: FastifyInstance) {
  return async function authorizeAdmin(request: any, reply: any) {
    // authenticate has already been called via onRequest; request.user is set
    const userId = request.user?.id;
    if (!userId) {
      return reply.code(401).send({
        error: 'Unauthorized',
        message: 'Authentication required',
      });
    }

    let role: string | null = null;

    // 1. Try Redis cache first: user:{id}:role
    try {
      const redis = getRedis();
      role = await redis.get(`user:${userId}:role`);
    } catch {
      // Redis may be unavailable — fall through to DB
    }

    // 2. Fallback: query the database
    if (!role) {
      try {
        const user = await prisma.user.findUnique({
          where: { id: userId },
          select: { role: true },
        });
        role = user?.role || 'user';
      } catch {
        role = 'user';
      }
    }

    if (role !== 'admin') {
      logger.warn('Admin authorization denied', {
        userId,
        role,
        ip: request.ip,
        path: request.url,
      });
      return reply.code(403).send({
        error: 'Forbidden',
        message: 'Admin access required',
      });
    }

    // Attach role to request for downstream use
    request.user.role = role;
  };
}

/**
 * Register authorizeAdmin as a Fastify decorator.
 * Call this after registering authenticate.
 */
export async function registerAuthorizeAdmin(app: FastifyInstance) {
  app.decorate('authorizeAdmin', authorizeAdminHook(app));
}
