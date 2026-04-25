/**
 * Sentry Error Tracking Integration
 * @module observability/sentry
 */

import * as Sentry from '@sentry/node';
import { nodeProfilingIntegration } from '@sentry/profiling-node';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';

export function initSentry() {
  if (!env.SENTRY_DSN) {
    logger.warn('Sentry DSN not configured, skipping initialization');
    return;
  }

  Sentry.init({
    dsn: env.SENTRY_DSN,
    environment: env.NODE_ENV,
    release: `aenews-builder@${process.env.npm_package_version || '1.0.0'}`,

    // Performance Monitoring
    tracesSampleRate: env.NODE_ENV === 'production' ? 0.1 : 1.0,

    // Profiling
    profilesSampleRate: env.NODE_ENV === 'production' ? 0.1 : 1.0,
    integrations: [nodeProfilingIntegration()],

    // Error sampling
    beforeSend(event, hint) {
      // Don't send errors in development
      if (env.NODE_ENV === 'development') {
        console.error('Sentry Error:', hint.originalException || hint.syntheticException);
        return null;
      }

      return event;
    },

    // Breadcrumbs
    maxBreadcrumbs: 50,
    attachStacktrace: true,

    // Filter sensitive data
    beforeBreadcrumb(breadcrumb) {
      // Don't log sensitive HTTP headers
      if (breadcrumb.category === 'http') {
        delete breadcrumb.data?.['Authorization'];
        delete breadcrumb.data?.['Cookie'];
      }

      return breadcrumb;
    },
  });

  logger.info('✅ Sentry error tracking initialized', {
    environment: env.NODE_ENV,
  });
}

/**
 * Capture exception with context
 */
export function captureException(
  error: Error,
  context?: {
    user?: { id: string; email?: string };
    tags?: Record<string, string>;
    extra?: Record<string, any>;
  }
) {
  Sentry.withScope((scope) => {
    if (context?.user) {
      scope.setUser(context.user);
    }

    if (context?.tags) {
      Object.entries(context.tags).forEach(([key, value]) => {
        scope.setTag(key, value);
      });
    }

    if (context?.extra) {
      Object.entries(context.extra).forEach(([key, value]) => {
        scope.setExtra(key, value);
      });
    }

    Sentry.captureException(error);
  });

  logger.error('Exception captured by Sentry', {
    error: error.message,
    stack: error.stack,
  });
}

/**
 * Start a transaction for performance monitoring
 */
export function startTransaction(
  name: string,
  op: string,
  data?: Record<string, any>
) {
  const transaction = Sentry.startTransaction({
    name,
    op,
    data,
  });

  return {
    transaction,
    finish: () => {
      transaction.finish();
    },
    setStatus: (status: 'ok' | 'error') => {
      transaction.setStatus(status);
    },
  };
}

/**
 * Add breadcrumb (trace user actions)
 */
export function addBreadcrumb(
  message: string,
  data?: Record<string, any>,
  level: 'debug' | 'info' | 'warning' | 'error' = 'info'
) {
  Sentry.addBreadcrumb({
    message,
    level,
    data,
    timestamp: Date.now() / 1000,
  });
}
