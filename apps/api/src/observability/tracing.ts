/**
 * OpenTelemetry Tracing with Jaeger/OTLP Exporter
 * @module observability/tracing
 */

import { trace, Span, Tracer, SpanStatusCode } from '@opentelemetry/api';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { Resource } from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-grpc';
import { SimpleSpanProcessor, BatchSpanProcessor, ConsoleSpanExporter } from '@opentelemetry/sdk-trace-base';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { logger } from '../config/logger.js';
import { config } from '../config/env.js';

let sdk: NodeSDK | null = null;
let tracer: Tracer;

export function initTracing(): void {
  if (sdk) return; // Already initialized

  const serviceName = config.server.serviceName || 'aenews-api';

  // Create resource
  const resource = new Resource({
    [ATTR_SERVICE_NAME]: serviceName,
    [ATTR_SERVICE_VERSION]: '3.1.0',
    environment: config.server.nodeEnv,
  });

  // Configure exporters based on environment
  const spanProcessors: SimpleSpanProcessor[] = [];

  if (config.tracing?.otlpEndpoint) {
    // Production: OTLP exporter (Jaeger, Tempo, etc.)
    const otlpExporter = new OTLPTraceExporter({
      url: config.tracing.otlpEndpoint,
    });
    spanProcessors.push(new BatchSpanProcessor(otlpExporter));
  }

  if (config.server.nodeEnv === 'development') {
    // Dev: Console exporter for easy debugging
    spanProcessors.push(new SimpleSpanProcessor(new ConsoleSpanExporter()));
  }

  if (spanProcessors.length === 0) {
    logger.warn('No tracing exporter configured — traces will be collected in-memory only');
    return;
  }

  sdk = new NodeSDK({
    resource,
    spanProcessors,
    autoInstrumentations: getNodeAutoInstrumentations({
      // Only instrument what we need
      '@opentelemetry/instrumentation-fs': { enabled: false },
      '@opentelemetry/instrumentation-dns': { enabled: false },
    }),
  });

  sdk.start();
  tracer = trace.getTracer(serviceName, '3.1.0');

  logger.info('Tracing initialized', {
    service: serviceName,
    exporters: spanProcessors.length,
    env: config.server.nodeEnv,
  });
}

export function getTracer(): Tracer {
  if (!tracer) {
    tracer = trace.getTracer('aenews-api', '3.1.0');
  }
  return tracer;
}

/**
 * Wrap an async function with tracing
 */
export async function traced<T>(
  name: string,
  fn: () => Promise<T>,
  attributes?: Record<string, string>
): Promise<T> {
  const t = getTracer();
  return t.startActiveSpan(name, { attributes }, async (span: Span) => {
    try {
      const result = await fn();
      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error(String(error));
      span.setStatus({ code: SpanStatusCode.ERROR, message: err.message });
      span.recordException(err);
      throw error;
    } finally {
      span.end();
    }
  });
}

/**
 * Create a child span
 */
export function createSpan(name: string, attributes?: Record<string, string>): Span {
  const t = getTracer();
  return t.startSpan(name, { attributes });
}

/**
 * Shutdown tracing (for graceful shutdown)
 */
export async function shutdownTracing(): Promise<void> {
  if (sdk) {
    await sdk.shutdown();
    logger.info('Tracing shutdown complete');
  }
}
