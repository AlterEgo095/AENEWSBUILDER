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
  logger.error({
    error: {
      message: error.message,
      stack: error.stack,
      validation: error.validation,
    },
    request: {
      method: request.method,
      url: request.url,
      headers: request.headers,
    },
  }, '❌ Request error');

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

  // Rate limit errors
  if (error.statusCode === 429) {
    reply.status(429).send({
      error: 'Too Many Requests',
      message: 'Rate limit exceeded. Please try again later.',
      statusCode: 429,
    });
    return;
  }

  // Default error
  const statusCode = error.statusCode || 500;
  reply.status(statusCode).send({
    error: error.name || 'Internal Server Error',
    message: statusCode === 500 ? 'An unexpected error occurred' : error.message,
    statusCode,
  });
}
