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


// AI Cost & Cache Metrics (used by ai-failover.ts)
export const aiCost = new Counter({
  name: 'ai_cost_usd',
  help: 'AI cost in USD',
  labelNames: ['type'],
  registers: [metricsRegistry],
});

export const aiCostAlerts = new Counter({
  name: 'ai_cost_alerts_total',
  help: 'AI cost alerts',
  labelNames: ['type'],
  registers: [metricsRegistry],
});

export const aiCacheHits = new Counter({
  name: 'ai_cache_hits_total',
  help: 'AI cache hits',
  registers: [metricsRegistry],
});

export const aiCacheMisses = new Counter({
  name: 'ai_cache_misses_total',
  help: 'AI cache misses',
  registers: [metricsRegistry],
});

export const aiRequests = aiRequestTotal; // alias to avoid duplicate registration

export const aiLatency = aiRequestDuration; // alias to avoid duplicate registration

// Redis Metrics (used by bull-config.ts)
export const redisConnections = new Gauge({
  name: 'redis_connections',
  help: 'Redis connections',
  labelNames: ['client', 'status'],
  registers: [metricsRegistry],
});

export const redisMemoryUsage = new Gauge({
  name: 'redis_memory_usage_percent',
  help: 'Redis memory usage percent',
  registers: [metricsRegistry],
});

// Queue Metrics (used by bull-config.ts)
export const queueErrors = new Counter({
  name: 'queue_errors_total',
  help: 'Queue errors',
  labelNames: ['queue'],
  registers: [metricsRegistry],
});

export const jobsProcessed = new Counter({
  name: 'jobs_processed_total',
  help: 'Jobs processed',
  labelNames: ['queue', 'status'],
  registers: [metricsRegistry],
});

export const jobsStalled = new Counter({
  name: 'jobs_stalled_total',
  help: 'Jobs stalled',
  labelNames: ['queue'],
  registers: [metricsRegistry],
});

export const workerErrors = new Counter({
  name: 'worker_errors_total',
  help: 'Worker errors',
  labelNames: ['worker'],
  registers: [metricsRegistry],
});

export const dlqJobs = new Counter({
  name: 'dlq_jobs_total',
  help: 'Dead letter queue jobs',
  labelNames: ['queue'],
  registers: [metricsRegistry],
});

// Sandbox Advanced Metrics (used by warm-pool.ts)
export const sandboxSecurityBreaches = new Counter({
  name: 'sandbox_security_breaches_total',
  help: 'Sandbox security breaches',
  labelNames: ['type'],
  registers: [metricsRegistry],
});

export const sandboxMemoryLeaks = new Counter({
  name: 'sandbox_memory_leaks_total',
  help: 'Sandbox memory leaks detected',
  registers: [metricsRegistry],
});

export const sandboxZombiesKilled = new Counter({
  name: 'sandbox_zombies_killed_total',
  help: 'Sandbox zombies killed',
  registers: [metricsRegistry],
});

export const sandboxDiskUsage = new Gauge({
  name: 'sandbox_disk_usage_percent',
  help: 'Sandbox disk usage percent',
  registers: [metricsRegistry],
});

export const sandboxAcquireTime = new Histogram({
  name: 'sandbox_acquire_time_seconds',
  help: 'Time to acquire sandbox container',
  buckets: [0.01, 0.05, 0.1, 0.5, 1, 5],
  registers: [metricsRegistry],
});

// MCP Security Metrics (used by packages/mcp/security.ts)
export const mcpToolsRegistered = new Gauge({
  name: 'mcp_tools_registered',
  help: 'Number of registered MCP tools',
  registers: [metricsRegistry],
});

export const mcpSecurityViolations = new Counter({
  name: 'mcp_security_violations_total',
  help: 'MCP security violations',
  labelNames: ['type', 'tool'],
  registers: [metricsRegistry],
});

export const mcpRateLimitHits = new Counter({
  name: 'mcp_rate_limit_hits_total',
  help: 'MCP rate limit hits',
  labelNames: ['tool'],
  registers: [metricsRegistry],
});

export const mcpAnomalies = new Counter({
  name: 'mcp_anomalies_total',
  help: 'MCP anomalies detected',
  labelNames: ['type'],
  registers: [metricsRegistry],
});

export const mcpInvocations = new Counter({
  name: 'mcp_invocations_total',
  help: 'MCP tool invocations',
  labelNames: ['tool', 'status'],
  registers: [metricsRegistry],
});

export const mcpPermissionDenials = new Counter({
  name: 'mcp_permission_denials_total',
  help: 'MCP permission denials',
  labelNames: ['tool'],
  registers: [metricsRegistry],
});


// MCP Parallel Execution Metrics (used by mcp-executor.ts)
export const mcpToolDuration = new Histogram({
  name: 'mcp_tool_duration_seconds',
  help: 'Duration of individual MCP tool executions in seconds',
  labelNames: ['tool_id'],
  buckets: [0.5, 1, 2, 5, 10, 20, 30],
  registers: [metricsRegistry],
});

export const mcpToolErrors = new Counter({
  name: 'mcp_tool_errors_total',
  help: 'Total number of MCP tool execution errors',
  labelNames: ['tool_id', 'error_type'],
  registers: [metricsRegistry],
});

export const mcpParallelExecutions = new Counter({
  name: 'mcp_parallel_executions_total',
  help: 'Total number of MCP parallel execution batches',
  labelNames: ['project_id', 'tool_count'],
  registers: [metricsRegistry],
});

logger.info('✅ Prometheus metrics initialized');
