/**
 * Authentication Routes
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(2),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

export async function authRoutes(app: FastifyInstance) {
  // Register
  app.post('/register', async (request, reply) => {
    const body = registerSchema.parse(request.body);
    
    // TODO: Implement user creation with Prisma
    const token = app.jwt.sign({
      userId: 'temp-user-id',
      email: body.email,
    });

    return reply.send({
      success: true,
      token,
      user: {
        email: body.email,
        name: body.name,
      },
    });
  });

  // Login
  app.post('/login', async (request, reply) => {
    const body = loginSchema.parse(request.body);
    
    // TODO: Implement authentication with Prisma
    const token = app.jwt.sign({
      userId: 'temp-user-id',
      email: body.email,
    });

    return reply.send({
      success: true,
      token,
    });
  });

  // Verify token
  app.get('/verify', {
    onRequest: [app.authenticate],
  }, async (request, reply) => {
    return reply.send({
      valid: true,
      user: request.user,
    });
  });
}
