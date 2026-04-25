/**
 * AENEWS BUILDER - API Gateway Entry Point
 * Industrial AI Operating System (L4 + MCP + SCALE)
 * 
 * @author Dieudonné MATANDA (ALTER EGO)
 * @version 3.0.0
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
import { errorHandler } from './middleware/error-handler.js';
import { authRoutes } from './routes/auth.routes.js';
import { projectRoutes } from './routes/project.routes.js';
import { streamRoutes } from './routes/stream.routes.js';
import { healthRoutes } from './routes/health.routes.js';
import { initRedis } from './services/redis.service.js';
import { initWorker } from './workers/index.js';
import fs from 'fs';
import path from 'path';

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
  });

  try {
    // ============================================
    // 🔐 SECURITY LAYER
    // ============================================
    
    // Helmet - Security Headers
    await app.register(helmet, {
      contentSecurityPolicy: config.csp.enabled ? {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          scriptSrc: ["'self'"],
          imgSrc: ["'self'", 'data:', 'https:'],
        },
      } : false,
      hsts: {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true,
      },
    });

    // CORS Configuration
    await app.register(cors, {
      origin: config.cors.origins,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
    });

    // Rate Limiting (Redis-backed)
    await app.register(rateLimit, {
      max: config.rateLimit.maxRequests,
      timeWindow: config.rateLimit.windowMs,
      redis: await initRedis(),
      skipOnError: false,
    });

    // Compression
    await app.register(compress, {
      encodings: ['gzip', 'deflate'],
    });

    // ============================================
    // 🔑 JWT AUTHENTICATION (RS256)
    // ============================================
    
    const privateKey = fs.readFileSync(
      path.resolve(config.jwt.privateKeyPath),
      'utf8'
    );
    const publicKey = fs.readFileSync(
      path.resolve(config.jwt.publicKeyPath),
      'utf8'
    );

    await app.register(jwt, {
      secret: {
        private: privateKey,
        public: publicKey,
      },
      sign: {
        algorithm: 'RS256',
        expiresIn: config.jwt.expiresIn,
      },
      verify: {
        algorithms: ['RS256'],
      },
    });

    // JWT Decorator with Claims Validation
    app.decorate('authenticate', async (request: any, reply: any) => {
      try {
        const decoded = await request.jwtVerify();
        
        // Validate token claims
        if (!decoded.sub || !decoded.exp) {
          throw new Error('Invalid token claims');
        }
        
        // Check token expiration with clock skew tolerance (5 min)
        const now = Math.floor(Date.now() / 1000);
        if (decoded.exp && decoded.exp < now - 300) {
          throw new Error('Token expired');
        }
        
        // Validate audience (if configured)
        if (config.jwt.audience && decoded.aud !== config.jwt.audience) {
          throw new Error('Invalid token audience');
        }
        
        // Attach user info to request
        request.user = { id: decoded.sub, email: decoded.email };
        
      } catch (err: any) {
        logger.warn('Authentication failed', { 
          error: err.message, 
          ip: request.ip,
          path: request.url 
        });
        reply.code(401).send({ 
          error: 'Unauthorized', 
          message: 'Invalid or expired token' 
        });
      }
    });

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
    await app.register(streamRoutes, { prefix: '/api/stream' });

    // ============================================
    // ⚠️  ERROR HANDLING
    // ============================================
    
    app.setErrorHandler(errorHandler);

    // 404 Handler
    app.setNotFoundHandler((request, reply) => {
      reply.code(404).send({
        error: 'Not Found',
        message: `Route ${request.method}:${request.url} not found`,
        statusCode: 404,
      });
    });

    // ============================================
    // 🚀 INITIALIZE WORKER ENGINE
    // ============================================
    
    await initWorker();
    app.log.info('✅ Worker Engine initialized');

    // ============================================
    // 🎯 START SERVER
    // ============================================
    
    await app.listen({
      port: config.server.port,
      host: config.server.host,
    });

    app.log.info(`
╔══════════════════════════════════════════════════════════════╗
║                                                              ║
║        🚀 AENEWS BUILDER API GATEWAY v3.0.0                  ║
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

process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, closing server gracefully...');
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received, closing server gracefully...');
  process.exit(0);
});

// Start Application
bootstrap();
