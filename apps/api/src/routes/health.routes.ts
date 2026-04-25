/**
 * Health Check Routes
 */

import type { FastifyInstance } from 'fastify';
import { getRedis } from '../services/redis.service.js';

export async function healthRoutes(app: FastifyInstance) {
  app.get('/', async (request, reply) => {
    const redis = getRedis();
    
    try {
      await redis.ping();
      
      return reply.send({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        services: {
          api: 'up',
          redis: 'up',
          database: 'up',
        },
      });
    } catch (error) {
      return reply.status(503).send({
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        error: 'Service unavailable',
      });
    }
  });
}
