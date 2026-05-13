/**
 * Auth Routes Integration Tests
 *
 * Uses Fastify's inject() method — no real HTTP server or external dependencies.
 * Tests registration, login, and token verification.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';

// ─── Mock external dependencies (hoisted by vitest) ────────────────────────

const mockUserFindUnique = vi.fn();
const mockUserCreate = vi.fn();

vi.mock('@prisma/client', () => ({
  PrismaClient: vi.fn().mockImplementation(() => ({
    user: {
      findUnique: (...args: any[]) => mockUserFindUnique(...args),
      create: (...args: any[]) => mockUserCreate(...args),
    },
  })),
}));

vi.mock('bcryptjs', () => ({
  default: {
    hash: vi.fn().mockResolvedValue('$2b$12$hashedpassword'),
    compare: vi.fn().mockResolvedValue(true),
  },
}));

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

// ─── Import auth routes after mocks ─────────────────────────────────────────

import { authRoutes } from '../auth.routes.js';
import bcrypt from 'bcryptjs';

// ─── Helpers ────────────────────────────────────────────────────────────────

async function buildApp() {
  const app = Fastify();
  // Register @fastify/jwt plugin (needed for app.jwt.sign and app.jwt.verify)
  await app.register(import('@fastify/jwt'), {
    secret: 'test-secret-key-that-is-at-least-thirty-two-chars',
  });
  // Add authenticate decorator (used by auth routes' GET /verify)
  app.decorate('authenticate', async function(request: any, reply: any) {
    try {
      await request.jwtVerify();
    } catch (err) {
      reply.send(err);
    }
  });
  await app.register(authRoutes);
  return app;
}

const validRegisterBody = {
  email: 'test@example.com',
  password: 'securepassword123',
  name: 'Test User',
};

const validLoginBody = {
  email: 'test@example.com',
  password: 'securepassword123',
};

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('Auth Routes', () => {
  let app: Fastify.FastifyInstance;

  beforeEach(async () => {
    app = await buildApp();
    vi.clearAllMocks();

    // Default: no existing user
    mockUserFindUnique.mockResolvedValue(null);
    // Default: create succeeds
    mockUserCreate.mockResolvedValue({
      id: 'user-1',
      email: 'test@example.com',
      name: 'Test User',
      password: '$2b$12$hashedpassword',
      createdAt: new Date().toISOString(),
    });
    // Reset bcrypt mocks to defaults
    (bcrypt.hash as any).mockResolvedValue('$2b$12$hashedpassword');
    (bcrypt.compare as any).mockResolvedValue(true);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // POST /register
  // ═══════════════════════════════════════════════════════════════════════════

  describe('POST /register', () => {
    it('should create a user with valid data and return 201', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/register',
        payload: validRegisterBody,
      });

      expect(res.statusCode).toBe(201);
      expect(res.json().success).toBe(true);
    });

    it('should return 400 when fields are missing', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/register',
        payload: { email: 'test@example.com' },
      });

      expect(res.statusCode).toBe(400);
      expect(res.json().success).toBe(false);
      expect(res.json().error).toBe('Validation error');
    });

    it('should return 400 when password is too short', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/register',
        payload: {
          email: 'test@example.com',
          password: 'short',
          name: 'Test User',
        },
      });

      expect(res.statusCode).toBe(400);
      expect(res.json().error).toBe('Validation error');
    });

    it('should return 400 when name is too short', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/register',
        payload: {
          email: 'test@example.com',
          password: 'securepassword123',
          name: 'T',
        },
      });

      expect(res.statusCode).toBe(400);
    });

    it('should return 409 when email already exists', async () => {
      mockUserFindUnique.mockResolvedValue({
        id: 'existing-user',
        email: 'test@example.com',
      });

      const res = await app.inject({
        method: 'POST',
        url: '/register',
        payload: validRegisterBody,
      });

      expect(res.statusCode).toBe(409);
      expect(res.json().error).toBe('User already exists');
    });

    it('should return token and user data on success', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/register',
        payload: validRegisterBody,
      });

      const body = res.json();
      expect(body).toHaveProperty('token');
      expect(typeof body.token).toBe('string');
      expect(body.user).toHaveProperty('id');
      expect(body.user).toHaveProperty('email', 'test@example.com');
      expect(body.user).toHaveProperty('name', 'Test User');
    });

    it('should not expose password in response', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/register',
        payload: validRegisterBody,
      });

      const body = res.json();
      expect(body.user).not.toHaveProperty('password');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // POST /login
  // ═══════════════════════════════════════════════════════════════════════════

  describe('POST /login', () => {
    it('should return 200 with valid credentials', async () => {
      mockUserFindUnique.mockResolvedValue({
        id: 'user-1',
        email: 'test@example.com',
        name: 'Test User',
        password: '$2b$12$hashedpassword',
      });

      const res = await app.inject({
        method: 'POST',
        url: '/login',
        payload: validLoginBody,
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().success).toBe(true);
    });

    it('should return 401 for unknown email', async () => {
      mockUserFindUnique.mockResolvedValue(null);

      const res = await app.inject({
        method: 'POST',
        url: '/login',
        payload: validLoginBody,
      });

      expect(res.statusCode).toBe(401);
      expect(res.json().error).toBe('Invalid credentials');
    });

    it('should return 401 for wrong password', async () => {
      mockUserFindUnique.mockResolvedValue({
        id: 'user-1',
        email: 'test@example.com',
        name: 'Test User',
        password: '$2b$12$hashedpassword',
      });
      (bcrypt.compare as any).mockResolvedValue(false);

      const res = await app.inject({
        method: 'POST',
        url: '/login',
        payload: validLoginBody,
      });

      expect(res.statusCode).toBe(401);
      expect(res.json().error).toBe('Invalid credentials');
    });

    it('should return token on successful login', async () => {
      mockUserFindUnique.mockResolvedValue({
        id: 'user-1',
        email: 'test@example.com',
        name: 'Test User',
        password: '$2b$12$hashedpassword',
      });

      const res = await app.inject({
        method: 'POST',
        url: '/login',
        payload: validLoginBody,
      });

      const body = res.json();
      expect(body).toHaveProperty('token');
      expect(typeof body.token).toBe('string');
    });

    it('should return user data on successful login', async () => {
      mockUserFindUnique.mockResolvedValue({
        id: 'user-1',
        email: 'test@example.com',
        name: 'Test User',
        password: '$2b$12$hashedpassword',
        createdAt: new Date().toISOString(),
      });

      const res = await app.inject({
        method: 'POST',
        url: '/login',
        payload: validLoginBody,
      });

      const body = res.json();
      expect(body.user).toHaveProperty('id', 'user-1');
      expect(body.user).toHaveProperty('email', 'test@example.com');
      expect(body.user).not.toHaveProperty('password');
    });

    it('should return 400 when login fields are missing', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/login',
        payload: { email: 'test@example.com' },
      });

      expect(res.statusCode).toBe(400);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Password hashing
  // ═══════════════════════════════════════════════════════════════════════════

  describe('password hashing', () => {
    it('should hash password with bcrypt during registration', async () => {
      await app.inject({
        method: 'POST',
        url: '/register',
        payload: validRegisterBody,
      });

      expect(bcrypt.hash).toHaveBeenCalledWith('securepassword123', 12);
    });

    it('should compare password with bcrypt during login', async () => {
      mockUserFindUnique.mockResolvedValue({
        id: 'user-1',
        email: 'test@example.com',
        password: '$2b$12$hashedpassword',
      });

      await app.inject({
        method: 'POST',
        url: '/login',
        payload: validLoginBody,
      });

      expect(bcrypt.compare).toHaveBeenCalledWith(
        'securepassword123',
        '$2b$12$hashedpassword'
      );
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // GET /verify
  // ═══════════════════════════════════════════════════════════════════════════

  describe('GET /verify', () => {
    it('should return 401 without token', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/verify',
      });

      expect(res.statusCode).toBe(401);
    });

    it('should return 200 with valid token', async () => {
      // Register to get a token
      const regRes = await app.inject({
        method: 'POST',
        url: '/register',
        payload: validRegisterBody,
      });

      const { token } = regRes.json();

      // Mock findUnique for verify endpoint's DB lookup
      mockUserFindUnique.mockResolvedValue({
        id: 'user-1',
        email: 'test@example.com',
        name: 'Test User',
        createdAt: new Date().toISOString(),
      });

      const res = await app.inject({
        method: 'GET',
        url: '/verify',
        headers: { Authorization: `Bearer ${token}` },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().valid).toBe(true);
    });

    it('should return user data from verify', async () => {
      // Register to get a token
      const regRes = await app.inject({
        method: 'POST',
        url: '/register',
        payload: validRegisterBody,
      });

      const { token } = regRes.json();

      mockUserFindUnique.mockResolvedValue({
        id: 'user-1',
        email: 'test@example.com',
        name: 'Test User',
        createdAt: '2024-01-01T00:00:00.000Z',
      });

      const res = await app.inject({
        method: 'GET',
        url: '/verify',
        headers: { Authorization: `Bearer ${token}` },
      });

      const body = res.json();
      expect(body.user).toHaveProperty('id', 'user-1');
      expect(body.user).toHaveProperty('email', 'test@example.com');
      expect(body.user).toHaveProperty('name', 'Test User');
    });
  });
});
