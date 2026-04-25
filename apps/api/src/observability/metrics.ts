/**
 * Prometheus Metrics - Production Observability
 * @module observability/metrics
 */

import { Registry, Counter, Histogram, Gauge, collectDefaultMetrics } from 'prom-client';
import { logger } from '../config/logger.js';

export const metricsRegistry = new Registry();

// Collect default Node.js metrics
collectDefaultMetrics({ register: metricsRegistry });

// ================== CUSTOM METRICS ==================

// HTTP Metrics
export const httpRequestDuration = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.01, 0.05, 0.1, 0.5, 1, 2, 5],
  registers: [metricsRegistry],
});

export const httpRequestTotal = new Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code'],
  registers: [metricsRegistry],
});

// Queue Metrics
export const queueJobsTotal = new Counter({
  name: 'queue_jobs_total',
  help: 'Total number of jobs added to queue',
  labelNames: ['queue', 'status'],
  registers: [metricsRegistry],
});

export const queueJobDuration = new Histogram({
  name: 'queue_job_duration_seconds',
  help: 'Duration of queue job processing',
  labelNames: ['queue', 'status'],
  buckets: [1, 5, 10, 30, 60, 120, 300],
  registers: [metricsRegistry],
});

export const queueSize = new Gauge({
  name: 'queue_size',
  help: 'Current size of queue',
  labelNames: ['queue', 'state'],
  registers: [metricsRegistry],
});

// AI Model Metrics
export const aiRequestTotal = new Counter({
  name: 'ai_requests_total',
  help: 'Total number of AI requests',
  labelNames: ['provider', 'model', 'status'],
  registers: [metricsRegistry],
});

export const aiRequestDuration = new Histogram({
  name: 'ai_request_duration_seconds',
  help: 'Duration of AI requests',
  labelNames: ['provider', 'model'],
  buckets: [1, 2, 5, 10, 20, 30, 60],
  registers: [metricsRegistry],
});

export const aiTokensUsed = new Counter({
  name: 'ai_tokens_used_total',
  help: 'Total tokens used by AI models',
  labelNames: ['provider', 'model', 'type'],
  registers: [metricsRegistry],
});

export const aiCostTotal = new Counter({
  name: 'ai_cost_usd_total',
  help: 'Total cost of AI requests in USD',
  labelNames: ['provider', 'model'],
  registers: [metricsRegistry],
});

// Sandbox Metrics
export const sandboxPoolSize = new Gauge({
  name: 'sandbox_pool_size',
  help: 'Current sandbox pool size',
  labelNames: ['status'],
  registers: [metricsRegistry],
});

export const sandboxExecutionDuration = new Histogram({
  name: 'sandbox_execution_duration_seconds',
  help: 'Duration of sandbox executions',
  labelNames: ['template', 'status'],
  buckets: [0.1, 0.5, 1, 2, 5, 10, 30],
  registers: [metricsRegistry],
});

export const sandboxExecutionTotal = new Counter({
  name: 'sandbox_executions_total',
  help: 'Total number of sandbox executions',
  labelNames: ['template', 'status'],
  registers: [metricsRegistry],
});

// MCP Tool Metrics
export const mcpToolExecutionTotal = new Counter({
  name: 'mcp_tool_executions_total',
  help: 'Total number of MCP tool executions',
  labelNames: ['tool', 'status'],
  registers: [metricsRegistry],
});

export const mcpToolExecutionDuration = new Histogram({
  name: 'mcp_tool_execution_duration_seconds',
  help: 'Duration of MCP tool executions',
  labelNames: ['tool'],
  buckets: [0.5, 1, 2, 5, 10, 20, 30],
  registers: [metricsRegistry],
});

// Event Store Metrics
export const eventStoreEventsTotal = new Counter({
  name: 'event_store_events_total',
  help: 'Total number of events stored',
  labelNames: ['type'],
  registers: [metricsRegistry],
});

export const eventStorePublishDuration = new Histogram({
  name: 'event_store_publish_duration_seconds',
  help: 'Duration of event publishing',
  buckets: [0.001, 0.005, 0.01, 0.05, 0.1],
  registers: [metricsRegistry],
});

// Circuit Breaker Metrics
export const circuitBreakerState = new Gauge({
  name: 'circuit_breaker_state',
  help: 'Circuit breaker state (0=closed, 1=open)',
  labelNames: ['provider'],
  registers: [metricsRegistry],
});

export const circuitBreakerTrips = new Counter({
  name: 'circuit_breaker_trips_total',
  help: 'Total number of circuit breaker trips',
  labelNames: ['provider'],
  registers: [metricsRegistry],
});

logger.info('✅ Prometheus metrics initialized');
