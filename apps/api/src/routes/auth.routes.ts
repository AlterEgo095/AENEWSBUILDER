/**
 * Authentication Routes - Real implementation with bcrypt + Prisma
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { prisma } from '../config/prisma.js';
import { getRedis } from '../services/redis.service.js';

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
    try {
      const body = registerSchema.parse(request.body);

      // Check if registration is enabled via Redis
      try {
        const redis = getRedis();
        const registrationEnabled = await redis.get('settings:registrationEnabled');
        if (registrationEnabled === 'false') {
          return reply.status(403).send({
            success: false,
            error: 'Registration is disabled',
            message: 'Registration is currently disabled. Please contact an administrator.',
          });
        }
      } catch {
        // Redis not available — allow registration to proceed (fail-open)
      }

      // Check if user already exists
      const existingUser = await prisma.user.findUnique({
        where: { email: body.email },
      });

      if (existingUser) {
        return reply.status(409).send({
          success: false,
          error: 'User already exists',
          message: 'An account with this email already exists',
        });
      }

      // Hash password with bcrypt (12 salt rounds)
      const saltRounds = 12;
      const hashedPassword = await bcrypt.hash(body.password, saltRounds);

      // Check if this is the first user — bootstrap them as admin
      const userCount = await prisma.user.count();

      // Create user in database
      const user = await prisma.user.create({
        data: {
          email: body.email,
          password: hashedPassword,
          name: body.name,
          role: userCount === 0 ? 'admin' : 'user',
        },
      });

      // Generate JWT token
      const token = app.jwt.sign({
        sub: user.id,
        email: user.email,
      });

      return reply.status(201).send({
        success: true,
        token,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          createdAt: user.createdAt,
        },
      });
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({
          success: false,
          error: 'Validation error',
          details: error.errors,
        });
      }
      request.log.error({ error }, 'Registration failed');
      return reply.status(500).send({
        success: false,
        error: 'Internal server error',
      });
    }
  });

  // Login
  app.post('/login', async (request, reply) => {
    try {
      const body = loginSchema.parse(request.body);

      // Find user by email
      const user = await prisma.user.findUnique({
        where: { email: body.email },
      });

      if (!user) {
        return reply.status(401).send({
          success: false,
          error: 'Invalid credentials',
          message: 'Email or password is incorrect',
        });
      }

      // Compare password with bcrypt
      const isPasswordValid = await bcrypt.compare(body.password, user.password);

      if (!isPasswordValid) {
        return reply.status(401).send({
          success: false,
          error: 'Invalid credentials',
          message: 'Email or password is incorrect',
        });
      }

      // Generate JWT token
      const token = app.jwt.sign({
        sub: user.id,
        email: user.email,
      });

      return reply.send({
        success: true,
        token,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          createdAt: user.createdAt,
        },
      });
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({
          success: false,
          error: 'Validation error',
          details: error.errors,
        });
      }
      request.log.error({ error }, 'Login failed');
      return reply.status(500).send({
        success: false,
        error: 'Internal server error',
      });
    }
  });

  // Verify token
  app.get('/verify', {
    onRequest: [(app as any).authenticate],
  }, async (request, reply) => {
    const user = request.user as any;

    // Fetch fresh user data from DB
    const dbUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: { id: true, email: true, name: true, role: true, createdAt: true },
    });

    if (!dbUser) {
      return reply.status(401).send({
        valid: false,
        error: 'User not found',
      });
    }

    return reply.send({
      valid: true,
      user: dbUser,
    });
  });

  // Get current user (me) — returns ApiResponse<User> shape
  app.get('/me', {
    onRequest: [(app as any).authenticate],
  }, async (request, reply) => {
    const user = request.user as any;

    // Fetch fresh user data from DB
    const dbUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: { id: true, email: true, name: true, role: true, createdAt: true },
    });

    if (!dbUser) {
      return reply.status(401).send({
        success: false,
        error: 'User not found',
      });
    }

    return reply.send({
      success: true,
      data: dbUser,
    });
  });
}
