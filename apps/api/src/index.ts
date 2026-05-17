/**
 * AENEWS BUILDER - API Gateway Entry Point
 * Industrial AI Operating System (L4 + MCP + SCALE)
 * 
 * FIX: Uses dynamic imports for heavy modules to prevent
 * module-level initialization from blocking the event loop.
 * 
 * @author Dieudonné MATANDA (ALTER EGO)
 * @version 3.0.1-dynamic-imports
 */

import Fastify from 'fastify';
import helmet from '@fastify/helmet';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import compress from '@fastify/compress';
import jwt from '@fastify/jwt';
import websocket from '@fastify/websocket';
import { config } from './config/env.js';
import { logger } from './config/logger.js';
import { validateModelRegistryOrExit } from './services/model-registry-validator.js';
import { errorHandler } from './middleware/error-handler.js';
import { registerAuthorizeAdmin } from './middleware/authorize-admin.js';
import { metricsRegistry } from './observability/metrics.js';
import { authRoutes } from './routes/auth.routes.js';
import { projectRoutes } from './routes/project.routes.js';
import { engineRoutes } from './routes/engine.routes.js';
import { streamRoutes } from './routes/stream.routes.js';
import { healthRoutes } from './routes/health.routes.js';
import { initRedis, closeRedis } from './services/redis.service.js';
import fs from 'fs';
import path from 'path';

let serverInstance: any = null;

/**
 * Initialize Fastify Server with Production-Ready Configuration
 */
async function bootstrap() {
  const app = Fastify({
    logger: logger,
    trustProxy: true,
    requestIdLogLabel: 'reqId',
    disableRequestLogging: false,
    requestIdHeader: 'x-request-id',
    bodyLimit: 10 * 1024 * 1024,
    maxParamLength: 500,
  });

  try {
    // ============================================
    // 📡 OBSERVABILITY
    // ============================================
    const { initSentry } = await import('./observability/sentry.js');
    initSentry();

    const { initTracing } = await import('./observability/tracing.js');
    initTracing();

    // ============================================
    // 🔐 SECURITY LAYER
    // ============================================
    await app.register(helmet, {
      contentSecurityPolicy: config.csp.enabled ? {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          scriptSrc: ["'self'"],
          imgSrc: ["'self'", 'data:', 'https:'],
        },
      } : false,
      hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
    });

    await app.register(cors, {
      origin: config.cors.origins,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
    });

    await app.register(rateLimit, {
      max: config.rateLimit.maxRequests,
      timeWindow: config.rateLimit.windowMs,
      redis: await initRedis(),
      skipOnError: true,
      ban: 10,
      onBanReach: (req: any, key: string) => {
        logger.error('IP BANNED - DDoS detected', { ip: req.ip, key });
      },
      errorResponseBuilder: (req: any, context: any) => ({
        statusCode: 429,
        error: 'Too many requests',
        message: 'Rate limit exceeded. Please try again later.',
        retryAfter: context.after,
        limit: config.rateLimit.maxRequests,
      }),
    });

    await app.register(compress, { encodings: ['gzip', 'deflate'] });

    // ============================================
    // 🔑 JWT AUTHENTICATION (RS256)
    // ============================================
    const privateKey = fs.readFileSync(path.resolve(config.jwt.privateKeyPath), 'utf8');
    const publicKey = fs.readFileSync(path.resolve(config.jwt.publicKeyPath), 'utf8');

    await app.register(jwt, {
      secret: { private: privateKey, public: publicKey },
      sign: { algorithm: 'RS256', expiresIn: config.jwt.expiresIn },
      verify: { algorithms: ['RS256'] },
    });

    app.decorate('authenticate', async (request: any, reply: any) => {
      try {
        const decoded = await request.jwtVerify();
        if (!decoded.sub || !decoded.exp) throw new Error('Invalid token claims');
        const now = Math.floor(Date.now() / 1000);
        if (decoded.exp < now) throw new Error('Token expired');
        const redis = await initRedis();
        const revoked = await redis.get(`revoked:token:${decoded.jti || decoded.sub}`);
        if (revoked) throw new Error('Token revoked');
        const banned = await redis.get(`user:banned:${decoded.sub}`);
        if (banned) { reply.code(403).send({ error: 'Forbidden', message: 'Account is banned' }); return; }
        request.user = { id: decoded.sub, email: decoded.email };
      } catch (err: any) {
        if (reply.statusCode === 403) return;
        // Fallback: try token from query parameter (for SSE/iframe which cannot send Authorization headers)
        const queryToken = (request.query as any)?.token;
        if (queryToken) {
          try {
            const decoded = await request.server.jwt.verify(queryToken) as any;
            if (!decoded.sub || !decoded.exp) throw new Error('Invalid token claims');
            const now = Math.floor(Date.now() / 1000);
            if (decoded.exp < now) throw new Error('Token expired');
            const redis = await initRedis();
            const revoked = await redis.get(`revoked:token:${decoded.jti || decoded.sub}`);
            if (revoked) throw new Error('Token revoked');
            const banned = await redis.get(`user:banned:${decoded.sub}`);
            if (banned) { reply.code(403).send({ error: 'Forbidden', message: 'Account is banned' }); return; }
            request.user = { id: decoded.sub, email: decoded.email };
          } catch (e: any) {
            if (reply.statusCode === 403) return;
            reply.code(401).send({ error: 'Unauthorized', message: 'Invalid or expired token' });
          }
        } else {
          reply.code(401).send({ error: 'Unauthorized', message: 'Invalid or expired token' });
        }
      }
    });

    registerAuthorizeAdmin(app);

    // ============================================
    // 🔌 WEBSOCKET SUPPORT (SSE)
    // ============================================
    await app.register(websocket);

    // ============================================
    // 📡 ROUTES REGISTRATION
    // ============================================
    await app.register(healthRoutes, { prefix: '/api/health' });
    await app.register(authRoutes, { prefix: '/api/auth' });
    await app.register(projectRoutes, { prefix: '/api/projects' });
    await app.register(engineRoutes, { prefix: '/api/engine' });
    await app.register(streamRoutes, { prefix: '/api/stream' });

    // Preview routes (for Studio live preview)
    const { previewRoutes } = await import('./routes/preview.routes.js');
    await app.register(previewRoutes, { prefix: '/api/preview' });


    // Refinement routes (conversational code refinement)
    const { refineRoutes } = await import('./routes/refine.routes.js');
    await app.register(refineRoutes, { prefix: '/api/refine' });
    // Dynamic imports for heavy route modules
    const { adminRoutes } = await import('./routes/admin.routes.js');
    await app.register(adminRoutes, { prefix: '/api/admin' });

    const { chatRoutes } = await import('./routes/chat.routes.js');
    await app.register(chatRoutes, { prefix: '/api/chat' });

    const { recoveryRoutes } = await import('./routes/recovery.routes.js');
    await app.register(recoveryRoutes, { prefix: '/api/recovery' });

    // Prometheus Metrics
    app.get('/metrics', async (request, reply) => {
      reply.type('text/plain');
      return metricsRegistry.metrics();
    });

    // ============================================
    // ⚠️  ERROR HANDLING
    // ============================================
    app.setErrorHandler(errorHandler);

    app.setNotFoundHandler((request, reply) => {
      reply.code(404).send({
        error: 'Not Found',
        message: `Route ${request.method}:${request.url} not found`,
        statusCode: 404,
      });
    });

    // ============================================
    // 🚀 DYNAMIC INIT: Worker Engine + Services
    // ============================================
    const { initWorker } = await import('./workers/index.js');
    await initWorker();
    
    // Dynamic imports for service singletons
    await import('./services/security-engine.js');
    await import('./services/context-memory.js');
    await import('./services/plan-versioning.js');

    app.log.info('Worker Engine initialized');
    app.log.info('Security Engine ready');
    app.log.info('Context Memory Engine ready');
    app.log.info('Plan Versioning Engine ready');
    app.log.info('Sandbox Warm Pool active');
    app.log.info('Event Store V2 (PostgreSQL + Redis Streams) active');
    app.log.info('Admin API routes registered (/api/admin/*)');
    app.log.info('Admin authorization middleware active');

    // ============================================
    // 🔍 PHASE 6: MODEL REGISTRY VALIDATION (BEFORE listen)
    // ============================================
    validateModelRegistryOrExit();
    logger.info('Model Registry Validation PASSED');

    // ============================================
    // 🎯 START SERVER
    // ============================================
    await app.listen({ port: config.server.port, host: config.server.host });

    serverInstance = app.server;

    app.log.info(`
╔══════════════════════════════════════════════════════════════╗
║                                                              ║
║        🚀 AENEWS BUILDER API GATEWAY v3.0.1                  ║
║        Industrial AI Operating System (L4 + MCP)             ║
║                                                              ║
║        🌐 Server: http://${config.server.host}:${config.server.port}              ║
║        📊 Environment: ${config.server.nodeEnv}                         ║
║        🔐 Security: JWT RS256 + Rate Limit + Helmet          ║
║                                                              ║
║        Created by: Dieudonné MATANDA (ALTER EGO)             ║
║                                                              ║
╚══════════════════════════════════════════════════════════════╝
    `);

  } catch (error) {
    app.log.error(error);
    process.exit(1);
  }
}

// ============================================
// 🔄 GRACEFUL SHUTDOWN
// ============================================
async function gracefulShutdown(signal: string) {
  logger.info(`${signal} received, closing server gracefully...`);
  try {
    if (serverInstance) await serverInstance.close();
    const { prisma } = await import('./config/prisma.js');
    await prisma.$disconnect();
    logger.info('Prisma disconnected');
    try { await closeRedis(); logger.info('Redis connection closed'); } catch { /* ok */ }
    const { shutdownTracing } = await import('./observability/tracing.js');
    await shutdownTracing();
    logger.info('Graceful shutdown complete');
  } catch (error) {
    logger.error({ error }, 'Error during graceful shutdown');
  }
  process.exit(0);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// ============================================
// 🎯 APPLICATION STARTUP (Worker Mode Support)
// ============================================
const workerMode = process.env.WORKER_MODE === 'true';

if (workerMode) {
  import('./workers/index.js').then(({ startWorkerOnly }) => {
    return startWorkerOnly();
  }).catch((error) => {
    console.error('Failed to start worker:', error);
    process.exit(1);
  });
} else {
  bootstrap();
}

