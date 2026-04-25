/**
 * Distributed Tracing - OpenTelemetry
 * @module observability/tracing
 */

import { trace, context, SpanStatusCode } from '@opentelemetry/api';
import { logger } from '../config/logger.js';

export const tracer = trace.getTracer('aenews-builder', '1.0.0');

/**
 * Create a traced function wrapper
 */
export function traced<T extends (...args: any[]) => any>(
  name: string,
  fn: T,
  attributes?: Record<string, any>
): T {
  return ((...args: Parameters<T>) => {
    return tracer.startActiveSpan(name, (span) => {
      try {
        // Add custom attributes
        if (attributes) {
          Object.entries(attributes).forEach(([key, value]) => {
            span.setAttribute(key, value);
          });
        }

        // Execute function
        const result = fn(...args);

        // Handle promises
        if (result instanceof Promise) {
          return result
            .then((res) => {
              span.setStatus({ code: SpanStatusCode.OK });
              span.end();
              return res;
            })
            .catch((err) => {
              span.setStatus({
                code: SpanStatusCode.ERROR,
                message: err.message,
              });
              span.recordException(err);
              span.end();
              throw err;
            });
        }

        // Sync function
        span.setStatus({ code: SpanStatusCode.OK });
        span.end();
        return result;
      } catch (error: any) {
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: error.message,
        });
        span.recordException(error);
        span.end();
        throw error;
      }
    });
  }) as T;
}

/**
 * Create a child span manually
 */
export function createSpan(name: string, attributes?: Record<string, any>) {
  const span = tracer.startSpan(name, {}, context.active());

  if (attributes) {
    Object.entries(attributes).forEach(([key, value]) => {
      span.setAttribute(key, value);
    });
  }

  return {
    span,
    end: (success: boolean = true) => {
      span.setStatus({
        code: success ? SpanStatusCode.OK : SpanStatusCode.ERROR,
      });
      span.end();
    },
    recordError: (error: Error) => {
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: error.message,
      });
      span.recordException(error);
    },
  };
}

logger.info('✅ Distributed tracing initialized');
