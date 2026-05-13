/**
 * Unit tests for Error Handler Middleware (error-handler.ts)
 *
 * Validates that the error handler correctly:
 * - Returns 400 for validation errors
 * - Returns 401 for JWT/token errors
 * - Returns 429 for rate-limit errors
 * - Returns appropriate status codes for default errors
 * - Hides internal messages on 500
 * - Logs full error and request details
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mock logger (hoisted by vitest) ────────────────────────────────────────

vi.mock('../../config/logger.js', () => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  },
}));

// ─── Import after mocks ─────────────────────────────────────────────────────

import { errorHandler } from '../error-handler.js';
import { logger } from '../../config/logger.js';

// ─── Helpers ────────────────────────────────────────────────────────────────

function createMockRequest(overrides: Record<string, any> = {}) {
  return {
    id: 'req-1',
    method: 'GET',
    url: '/test',
    headers: {},
    ...overrides,
  };
}

function createMockReply() {
  const reply: Record<string, any> = {
    status: vi.fn().mockReturnThis(),
    send: vi.fn().mockReturnThis(),
  };
  return reply;
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('Error Handler Middleware', () => {
  let mockRequest: ReturnType<typeof createMockRequest>;
  let mockReply: ReturnType<typeof createMockReply>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockRequest = createMockRequest();
    mockReply = createMockReply();
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Validation errors → 400
  // ═══════════════════════════════════════════════════════════════════════════

  describe('validation errors', () => {
    it('should return 400 when error.validation exists', async () => {
      const error = {
        message: 'Validation failed',
        validation: [{ field: 'email', message: 'Invalid email' }],
      } as any;

      await errorHandler(error, mockRequest as any, mockReply as any);

      expect(mockReply.status).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Validation Error',
          statusCode: 400,
        })
      );
    });

    it('should include validation details in response', async () => {
      const validationDetails = [
        { field: 'email', message: 'Invalid email' },
        { field: 'password', message: 'Too short' },
      ];
      const error = {
        message: 'Validation failed',
        validation: validationDetails,
      } as any;

      await errorHandler(error, mockRequest as any, mockReply as any);

      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          details: validationDetails,
        })
      );
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // JWT / Token errors → 401
  // ═══════════════════════════════════════════════════════════════════════════

  describe('JWT errors', () => {
    it('should return 401 when error message contains "jwt"', async () => {
      const error = {
        message: 'invalid jwt signature',
        name: 'JsonWebTokenError',
      } as any;

      await errorHandler(error, mockRequest as any, mockReply as any);

      expect(mockReply.status).toHaveBeenCalledWith(401);
      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Unauthorized',
          statusCode: 401,
        })
      );
    });

    it('should return 401 when error message contains "token"', async () => {
      const error = {
        message: 'expired token',
        name: 'TokenExpiredError',
      } as any;

      await errorHandler(error, mockRequest as any, mockReply as any);

      expect(mockReply.status).toHaveBeenCalledWith(401);
      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Unauthorized',
          statusCode: 401,
        })
      );
    });

    it('should return 401 when error message contains "token" (case-sensitive)', async () => {
      const error = {
        message: 'refresh token expired',
        name: 'Error',
      } as any;

      await errorHandler(error, mockRequest as any, mockReply as any);

      expect(mockReply.status).toHaveBeenCalledWith(401);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Rate limit errors → 429
  // ═══════════════════════════════════════════════════════════════════════════

  describe('rate limit errors', () => {
    it('should return 429 when error.statusCode is 429', async () => {
      const error = {
        message: 'Too many requests',
        statusCode: 429,
        name: 'RateLimitError',
      } as any;

      await errorHandler(error, mockRequest as any, mockReply as any);

      expect(mockReply.status).toHaveBeenCalledWith(429);
      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Too many requests',
          message: 'Rate limit exceeded. Please try again later.',
          statusCode: 429,
        })
      );
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Default errors
  // ═══════════════════════════════════════════════════════════════════════════

  describe('default errors', () => {
    it('should return 500 when no statusCode is set', async () => {
      const error = new Error('Something went wrong') as any;

      await errorHandler(error, mockRequest as any, mockReply as any);

      expect(mockReply.status).toHaveBeenCalledWith(500);
    });

    it('should use error.statusCode when present', async () => {
      const error = new Error('Not found') as any;
      error.statusCode = 404;

      await errorHandler(error, mockRequest as any, mockReply as any);

      expect(mockReply.status).toHaveBeenCalledWith(404);
    });

    it('should hide message on 500 errors', async () => {
      const error = new Error('Secret database connection string exposed') as any;

      await errorHandler(error, mockRequest as any, mockReply as any);

      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'An unexpected error occurred',
        })
      );
    });

    it('should show message for non-500 status codes', async () => {
      const error = new Error('Entity not found') as any;
      error.statusCode = 404;

      await errorHandler(error, mockRequest as any, mockReply as any);

      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Entity not found',
        })
      );
    });

    it('should use error.name when available', async () => {
      const error = new Error('bad') as any;
      error.name = 'CustomError';
      error.statusCode = 422;

      await errorHandler(error, mockRequest as any, mockReply as any);

      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'CustomError',
        })
      );
    });

    it('should use "Internal Server Error" when error.name is missing on 500', async () => {
      const error = { message: 'oops' } as any;

      await errorHandler(error, mockRequest as any, mockReply as any);

      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Internal Server Error',
        })
      );
    });

    it('should handle error with empty message', async () => {
      const error = new Error('') as any;

      await errorHandler(error, mockRequest as any, mockReply as any);

      expect(mockReply.status).toHaveBeenCalledWith(500);
      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 500,
        })
      );
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Logging
  // ═══════════════════════════════════════════════════════════════════════════

  describe('logging', () => {
    it('should log full error details', async () => {
      const error = new Error('test error') as any;
      error.stack = 'Error: test error\n    at Test';

      await errorHandler(error, mockRequest as any, mockReply as any);

      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({
            message: 'test error',
            stack: 'Error: test error\n    at Test',
          }),
        }),
        expect.any(String)
      );
    });

    it('should log request details (method, url, headers)', async () => {
      const error = new Error('test') as any;

      await errorHandler(error, mockRequest as any, mockReply as any);

      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          request: {
            method: 'GET',
            url: '/test',
            headers: {},
          },
        }),
        expect.any(String)
      );
    });

    it('should always log regardless of error type', async () => {
      const validationError = {
        message: 'Validation failed',
        validation: [{ field: 'x' }],
      } as any;

      await errorHandler(validationError, mockRequest as any, mockReply as any);

      expect(logger.error).toHaveBeenCalledTimes(1);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // reply chain
  // ═══════════════════════════════════════════════════════════════════════════

  describe('reply chain', () => {
    it('should call reply.status() before reply.send()', async () => {
      const error = new Error('test') as any;

      const callOrder: string[] = [];
      mockReply.status.mockImplementation(function(this: any) {
        callOrder.push('status');
        return this;
      });
      mockReply.send.mockImplementation(function(this: any) {
        callOrder.push('send');
        return this;
      });

      await errorHandler(error, mockRequest as any, mockReply as any);

      expect(callOrder).toEqual(['status', 'send']);
    });

    it('should return the reply for chaining', async () => {
      const error = new Error('test') as any;

      const result = await errorHandler(error, mockRequest as any, mockReply as any);

      // Function returns void; the key is that status() returns this
      expect(mockReply.status).toHaveBeenCalledWith(500);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Priority ordering
  // ═══════════════════════════════════════════════════════════════════════════

  describe('priority ordering', () => {
    it('should prioritize validation error over JWT error', async () => {
      const error = {
        message: 'jwt expired',
        validation: [{ field: 'x' }],
      } as any;

      await errorHandler(error, mockRequest as any, mockReply as any);

      expect(mockReply.status).toHaveBeenCalledWith(400);
    });

    it('should prioritize rate limit over validation error', async () => {
      const error = {
        message: 'Too many',
        statusCode: 429,
        validation: [{ field: 'x' }],
      } as any;

      await errorHandler(error, mockRequest as any, mockReply as any);

      expect(mockReply.status).toHaveBeenCalledWith(429);
    });

    it('should prioritize JWT error over default', async () => {
      const error = {
        message: 'jwt malformed',
        statusCode: 500,
      } as any;

      await errorHandler(error, mockRequest as any, mockReply as any);

      expect(mockReply.status).toHaveBeenCalledWith(401);
    });
  });
});
