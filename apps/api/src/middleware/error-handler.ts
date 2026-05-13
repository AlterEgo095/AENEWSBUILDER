/**
 * Error Handler Middleware
 */

import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import { logger } from '../config/logger.js';

export async function errorHandler(
  error: FastifyError,
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  // ── Rate limit errors (check FIRST — before generic error log) ──
  const isRateLimitError =
    (error as any).statusCode === 429 ||
    (error as any).code === 'FST_ERR_RATE_LIMIT_EXCEEDED' ||
    (error.message && /rate.?limit/i.test(error.message));

  if (isRateLimitError) {
    logger.warn({
      ip: request.ip,
      method: request.method,
      url: request.url,
      code: (error as any).code,
    }, '⚠️ Rate limit exceeded');

    reply.status(429).send({
      error: 'Too many requests',
      message: 'Rate limit exceeded. Please try again later.',
      statusCode: 429,
    });
    return;
  }

  // ── Generic error logging (warn for 4xx, error for 5xx) ──
  const isClientError = (error as any).statusCode >= 400 && (error as any).statusCode < 500;
  const logFn = isClientError ? logger.warn.bind(logger) : logger.error.bind(logger);

  // Strip sensitive headers before logging
  const { authorization, cookie, 'x-api-key': xApiKey, ...safeHeaders } = request.headers;

  logFn({
    error: {
      message: error.message,
      stack: error.stack,
      validation: error.validation,
    },
    request: {
      method: request.method,
      url: request.url,
      headers: safeHeaders,
    },
  }, isClientError ? '⚠️ Client request error' : '❌ Request error');

  // Validation errors
  if (error.validation) {
    reply.status(400).send({
      error: 'Validation Error',
      message: 'Invalid request parameters',
      details: error.validation,
      statusCode: 400,
    });
    return;
  }

  // JWT errors
  if (error.message.includes('jwt') || error.message.includes('token')) {
    reply.status(401).send({
      error: 'Unauthorized',
      message: 'Invalid or expired token',
      statusCode: 401,
    });
    return;
  }

  // Default error
  const statusCode = (error as any).statusCode || 500;
  reply.status(statusCode).send({
    error: error.name || 'Internal Server Error',
    message: statusCode === 500 ? 'An unexpected error occurred' : error.message,
    statusCode,
  });
}
