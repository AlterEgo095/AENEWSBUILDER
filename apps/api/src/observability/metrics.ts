/**
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * 📊 PROMETHEUS METRICS - Production Enhanced
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * 
 * NOUVELLES MÉTRIQUES vs V1 :
 * ✅ Queue saturation (0-1 scale)
 * ✅ Redis health (0/1 binary)
 * ✅ Circuit breaker trips counter
 * ✅ DLQ jobs counter
 * ✅ Jobs stalled counter
 * ✅ Redis errors counter
 * ✅ Job duration histogram (p50, p95, p99)
 * ✅ AI model usage by provider
 * ✅ Sandbox container lifecycle metrics
 * ✅ MCP tool invocation tracking
 * 
 * TOTAL : 25 métriques custom (vs 17 en V1)
 * 
 * @version 2.0.0 - Production Grade
 */

import { register, Counter, Gauge, Histogram, collectDefaultMetrics } from 'prom-client';

// Collect default Node.js metrics (CPU, memory, event loop, etc.)
collectDefaultMetrics({ register, prefix: 'aenews_' });

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 📈 COUNTER METRICS (monotonic incrementing)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const httpRequestsTotal = new Counter({
  name: 'aenews_http_requests_total',
  help: 'Total HTTP requests received',
  labelNames: ['method', 'route', 'status_code'],
  registers: [register],
});

const jobsCreatedTotal = new Counter({
  name: 'aenews_jobs_created_total',
  help: 'Total jobs created in BullMQ',
  registers: [register],
});

const jobsCompletedTotal = new Counter({
  name: 'aenews_jobs_completed_total',
  help: 'Total jobs completed successfully',
  registers: [register],
});

const jobsFailedTotal = new Counter({
  name: 'aenews_jobs_failed_total',
  help: 'Total jobs failed',
  registers: [register],
});

const jobsStalledTotal = new Counter({
  name: 'aenews_jobs_stalled_total',
  help: 'Total jobs stalled (locked too long)',
  registers: [register],
});

const dlqJobsTotal = new Counter({
  name: 'aenews_dlq_jobs_total',
  help: 'Total jobs moved to Dead Letter Queue',
  registers: [register],
});

const circuitBreakerTripsTotal = new Counter({
  name: 'aenews_circuit_breaker_trips_total',
  help: 'Total circuit breaker trips (Redis failures)',
  registers: [register],
});

const redisErrorsTotal = new Counter({
  name: 'aenews_redis_errors_total',
  help: 'Total Redis connection/operation errors',
  registers: [register],
});

const aiRequestsTotal = new Counter({
  name: 'aenews_ai_requests_total',
  help: 'Total AI API requests',
  labelNames: ['provider', 'model', 'status'],
  registers: [register],
});

const aiCostTotal = new Counter({
  name: 'aenews_ai_cost_total_usd',
  help: 'Total AI cost in USD',
  labelNames: ['provider', 'model'],
  registers: [register],
});

const sandboxContainersCreated = new Counter({
  name: 'aenews_sandbox_containers_created_total',
  help: 'Total sandbox containers created',
  registers: [register],
});

const sandboxContainersDestroyed = new Counter({
  name: 'aenews_sandbox_containers_destroyed_total',
  help: 'Total sandbox containers destroyed',
  registers: [register],
});

const mcpToolInvocations = new Counter({
  name: 'aenews_mcp_tool_invocations_total',
  help: 'Total MCP tool invocations',
  labelNames: ['tool_name', 'status'],
  registers: [register],
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 📊 GAUGE METRICS (can go up and down)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const queueSize = new Gauge({
  name: 'aenews_queue_size',
  help: 'Current queue size by state',
  labelNames: ['state'], // waiting, active, delayed, failed
  registers: [register],
});

const queueSaturation = new Gauge({
  name: 'aenews_queue_saturation',
  help: 'Queue saturation level (0-1)',
  registers: [register],
});

const redisHealth = new Gauge({
  name: 'aenews_redis_health',
  help: 'Redis connection health (0=unhealthy, 1=healthy)',
  registers: [register],
});

const sandboxWarmPoolSize = new Gauge({
  name: 'aenews_sandbox_warm_pool_size',
  help: 'Current warm pool size',
  registers: [register],
});

const sandboxActiveContainers = new Gauge({
  name: 'aenews_sandbox_active_containers',
  help: 'Currently active sandbox containers',
  registers: [register],
});

const aiModelUsage = new Gauge({
  name: 'aenews_ai_model_usage',
  help: 'Current AI model usage count',
  labelNames: ['provider', 'model'],
  registers: [register],
});

const eventStoreSize = new Gauge({
  name: 'aenews_event_store_size',
  help: 'Current event store size (Redis + PostgreSQL)',
  labelNames: ['storage_type'], // redis, postgres
  registers: [register],
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ⏱️ HISTOGRAM METRICS (distributions + percentiles)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const httpRequestDuration = new Histogram({
  name: 'aenews_http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'route'],
  buckets: [0.1, 0.5, 1, 2, 5, 10], // SLA: p95 < 2s
  registers: [register],
});

const jobDuration = new Histogram({
  name: 'aenews_job_duration_seconds',
  help: 'Job processing duration in seconds',
  buckets: [10, 30, 60, 120, 300, 600], // SLA: p95 < 300s
  registers: [register],
});

const aiRequestDuration = new Histogram({
  name: 'aenews_ai_request_duration_seconds',
  help: 'AI API request duration in seconds',
  labelNames: ['provider', 'model'],
  buckets: [1, 5, 10, 30, 60, 120], // SLA: p95 < 30s
  registers: [register],
});

const sandboxExecutionDuration = new Histogram({
  name: 'aenews_sandbox_execution_duration_seconds',
  help: 'Sandbox execution duration in seconds',
  buckets: [1, 5, 10, 30, 60], // SLA: p95 < 30s
  registers: [register],
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 🔧 METRICS SERVICE CLASS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

class MetricsService {
  // ═══════════════════════════════════════════════════════════════
  // HTTP METRICS
  // ═══════════════════════════════════════════════════════════════
  
  recordHttpRequest(method: string, route: string, statusCode: number, duration: number): void {
    httpRequestsTotal.inc({ method, route, status_code: statusCode });
    httpRequestDuration.observe({ method, route }, duration / 1000);
  }

  // ═══════════════════════════════════════════════════════════════
  // JOB QUEUE METRICS
  // ═══════════════════════════════════════════════════════════════
  
  incrementJobsCreated(): void {
    jobsCreatedTotal.inc();
  }

  incrementJobsCompleted(): void {
    jobsCompletedTotal.inc();
  }

  incrementJobsFailed(): void {
    jobsFailedTotal.inc();
  }

  incrementJobsStalled(): void {
    jobsStalledTotal.inc();
  }

  incrementDLQJobs(): void {
    dlqJobsTotal.inc();
  }

  recordJobDuration(durationMs: number): void {
    jobDuration.observe(durationMs / 1000);
  }

  setQueueSize(state: 'waiting' | 'active' | 'delayed' | 'failed', size: number): void {
    queueSize.set({ state }, size);
  }

  setQueueSaturation(level: number): void {
    queueSaturation.set(level);
  }

  // ═══════════════════════════════════════════════════════════════
  // REDIS METRICS
  // ═══════════════════════════════════════════════════════════════
  
  setRedisHealth(health: 0 | 1): void {
    redisHealth.set(health);
  }

  incrementRedisErrors(): void {
    redisErrorsTotal.inc();
  }

  incrementCircuitBreakerTrips(): void {
    circuitBreakerTripsTotal.inc();
  }

  // ═══════════════════════════════════════════════════════════════
  // AI METRICS
  // ═══════════════════════════════════════════════════════════════
  
  recordAIRequest(
    provider: 'openai' | 'anthropic',
    model: string,
    status: 'success' | 'error',
    durationMs: number,
    costUsd: number
  ): void {
    aiRequestsTotal.inc({ provider, model, status });
    aiRequestDuration.observe({ provider, model }, durationMs / 1000);
    aiCostTotal.inc({ provider, model }, costUsd);
    aiModelUsage.inc({ provider, model });
  }

  // ═══════════════════════════════════════════════════════════════
  // SANDBOX METRICS
  // ═══════════════════════════════════════════════════════════════
  
  incrementSandboxContainersCreated(): void {
    sandboxContainersCreated.inc();
  }

  incrementSandboxContainersDestroyed(): void {
    sandboxContainersDestroyed.inc();
  }

  setSandboxWarmPoolSize(size: number): void {
    sandboxWarmPoolSize.set(size);
  }

  setSandboxActiveContainers(count: number): void {
    sandboxActiveContainers.set(count);
  }

  recordSandboxExecution(durationMs: number): void {
    sandboxExecutionDuration.observe(durationMs / 1000);
  }

  // ═══════════════════════════════════════════════════════════════
  // MCP METRICS
  // ═══════════════════════════════════════════════════════════════
  
  recordMCPToolInvocation(toolName: string, status: 'success' | 'error'): void {
    mcpToolInvocations.inc({ tool_name: toolName, status });
  }

  // ═══════════════════════════════════════════════════════════════
  // EVENT STORE METRICS
  // ═══════════════════════════════════════════════════════════════
  
  setEventStoreSize(storageType: 'redis' | 'postgres', size: number): void {
    eventStoreSize.set({ storage_type: storageType }, size);
  }

  // ═══════════════════════════════════════════════════════════════
  // EXPORT METRICS (for /metrics endpoint)
  // ═══════════════════════════════════════════════════════════════
  
  async getMetrics(): Promise<string> {
    return register.metrics();
  }

  getContentType(): string {
    return register.contentType;
  }

  // ═══════════════════════════════════════════════════════════════
  // RESET (for testing only)
  // ═══════════════════════════════════════════════════════════════
  
  reset(): void {
    register.resetMetrics();
  }
}

export const metricsService = new MetricsService();
export { register };
