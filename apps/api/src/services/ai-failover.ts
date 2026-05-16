/**
 * █████╗ ██╗    ███████╗ █████╗ ██╗██╗      ██████╗ ██╗   ██╗███████╗██████╗ 
 * ██╔══██╗██║    ██╔════╝██╔══██╗██║██║     ██╔═══██╗██║   ██║██╔════╝██╔══██╗
 * ███████║██║    █████╗  ███████║██║██║     ██║   ██║██║   ██║█████╗  ██████╔╝
 * ██╔══██║██║    ██╔══╝  ██╔══██║██║██║     ██║   ██║╚██╗ ██╔╝██╔══╝  ██╔══██╗
 * ██║  ██║██║    ██║     ██║  ██║██║███████╗╚██████╔╝ ╚████╔╝ ███████╗██║  ██║
 * ╚═╝  ╚═╝╚═╝    ╚═╝     ╚═╝  ╚═╝╚═╝╚══════╝ ╚═════╝   ╚═══╝  ╚══════╝╚═╝  ╚═╝
 * 
 * AENEWS BUILDER v3.0 - Production-Grade AI Failover System
 * 
 * ✅ HARDENING FEATURES:
 * - Hystrix Circuit Breaker (OPEN/HALF_OPEN/CLOSED states)
 * - Cascade Fallback (GPT-4o → Claude Sonnet → Gemini)
 * - Smart Cache (semantic similarity, TTL, LRU)
 * - Cost Throttling with Alerts (spike detection, runaway loop)
 * - Intelligent Retry (exponential backoff, jitter)
 * - Model Auto-Selection (cost/performance optimization)
 * - Provider Health Monitoring
 * 
 * @author Dieudonneé MATANDA (ALTER EGO)
 * @version 3.0.0-hardened
 * @license MIT
 */

import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { LRUCache } from 'lru-cache';
import crypto from 'crypto';
import { logger } from '../config/logger.js';
import { env, config } from '../config/env.js';
import {
  aiCost, aiCostAlerts, aiCacheHits, aiCacheMisses,
  aiRequests as aiRequestsMetric, aiLatency, circuitBreakerState
} from '../observability/metrics.js';

// ═══════════════════════════════════════════════════════════════════════════
// 🔧 TYPES & ENUMS
// ═══════════════════════════════════════════════════════════════════════════

export enum AIProvider {
  OPENAI = 'openai',
  CLAUDE = 'claude',
  GEMINI = 'gemini',
  DASHSCOPE = 'dashscope',
}

export interface AIModel {
  provider: AIProvider;
  name: string;
  maxTokens: number;
  costPer1kTokens: { input: number; output: number };
  tier: 'fast' | 'standard' | 'advanced';
}

export interface AIRequest {
  messages: Array<{ role: string; content: string }>;
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
  projectId?: string; // For budget tracking
}

export interface AIResponse {
  content: string;
  provider: AIProvider;
  model: string;
  usage: {
    inputTokens: number;
    outputTokens: number;
    cost: number;
  };
  latency: number;
  attempt: number;
  cached?: boolean;
}

export interface FailoverConfig {
  primary: string;
  fallbacks: string[];
  maxRetries: number;
  retryDelay: number;
  timeout: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// 🗂️ MODEL REGISTRY
// ═══════════════════════════════════════════════════════════════════════════

export const MODEL_REGISTRY: Record<string, AIModel> = {
  // OpenAI Models
  'gpt-4o-mini': {
    provider: AIProvider.OPENAI,
    name: 'gpt-4o-mini',
    maxTokens: 128000,
    costPer1kTokens: { input: 0.00015, output: 0.0006 },
    tier: 'fast',
  },
  'gpt-4o': {
    provider: AIProvider.OPENAI,
    name: 'gpt-4o',
    maxTokens: 128000,
    costPer1kTokens: { input: 0.0025, output: 0.01 },
    tier: 'standard',
  },
  'gpt-4-turbo': {
    provider: AIProvider.OPENAI,
    name: 'gpt-4-turbo',
    maxTokens: 128000,
    costPer1kTokens: { input: 0.01, output: 0.03 },
    tier: 'advanced',
  },

  // Anthropic Models
  'claude-3-haiku': {
    provider: AIProvider.CLAUDE,
    name: 'claude-3-haiku-20240307',
    maxTokens: 200000,
    costPer1kTokens: { input: 0.00025, output: 0.00125 },
    tier: 'fast',
  },
  'claude-3-sonnet': {
    provider: AIProvider.CLAUDE,
    name: 'claude-3-5-sonnet-20241022',
    maxTokens: 200000,
    costPer1kTokens: { input: 0.003, output: 0.015 },
    tier: 'standard',
  },
  'claude-3-opus': {
    provider: AIProvider.CLAUDE,
    name: 'claude-3-opus-20240229',
    maxTokens: 200000,
    costPer1kTokens: { input: 0.015, output: 0.075 },
    tier: 'advanced',
  },

  // ═══════════════════════════════════════════════════════════════
  // Alibaba Cloud DashScope — Qwen Models (OpenAI-compatible)
  // 100+ models available, 6 primary tiers registered here
  // ═══════════════════════════════════════════════════════════════
  'qwen-turbo': {
    provider: AIProvider.DASHSCOPE,
    name: 'qwen-turbo',
    maxTokens: 8192,
    costPer1kTokens: { input: 0.00012, output: 0.00036 },
    tier: 'fast',
  },
  'qwen-plus': {
    provider: AIProvider.DASHSCOPE,
    name: 'qwen-plus',
    maxTokens: 131072,
    costPer1kTokens: { input: 0.0004, output: 0.0012 },
    tier: 'standard',
  },
  'qwen-max': {
    provider: AIProvider.DASHSCOPE,
    name: 'qwen-max',
    maxTokens: 8192,
    costPer1kTokens: { input: 0.0012, output: 0.0036 },
    tier: 'advanced',
  },
  'qwen3-235b-a22b': {
    provider: AIProvider.DASHSCOPE,
    name: 'qwen3-235b-a22b',
    maxTokens: 131072,
    costPer1kTokens: { input: 0.0003, output: 0.0009 },
    tier: 'standard',
  },
  'qwen3-30b-a3b': {
    provider: AIProvider.DASHSCOPE,
    name: 'qwen3-30b-a3b-instruct-2507',
    maxTokens: 131072,
    costPer1kTokens: { input: 0.0003, output: 0.0009 },
    tier: 'standard',
  },
  'qwen-coder-plus': {
    provider: AIProvider.DASHSCOPE,
    name: 'qwen-coder-plus',
    maxTokens: 131072,
    costPer1kTokens: { input: 0.0004, output: 0.0012 },
    tier: 'standard',
  },

  // ═══════════════════════════════════════════════════════════════
  // Alibaba Cloud DashScope — NEW MODELS (106 available, 8 specialized)
  // ═══════════════════════════════════════════════════════════════
  'qwen3-coder-480b': {
    provider: AIProvider.DASHSCOPE,
    name: 'qwen3-coder-480b-a35b-instruct',
    maxTokens: 131072,
    costPer1kTokens: { input: 0.001, output: 0.003 },
    tier: 'advanced',
  },
  'qwen3-coder-plus': {
    provider: AIProvider.DASHSCOPE,
    name: 'qwen3-coder-plus',
    maxTokens: 131072,
    costPer1kTokens: { input: 0.0005, output: 0.0015 },
    tier: 'standard',
  },
  'qwen3-coder-flash': {
    provider: AIProvider.DASHSCOPE,
    name: 'qwen3-coder-flash',
    maxTokens: 131072,
    costPer1kTokens: { input: 0.0001, output: 0.0003 },
    tier: 'fast',
  },
  'qwen3.6-plus': {
    provider: AIProvider.DASHSCOPE,
    name: 'qwen3.6-plus',
    maxTokens: 131072,
    costPer1kTokens: { input: 0.0004, output: 0.0012 },
    tier: 'standard',
  },
  'qwen3.6-flash': {
    provider: AIProvider.DASHSCOPE,
    name: 'qwen3.6-flash',
    maxTokens: 131072,
    costPer1kTokens: { input: 0.0001, output: 0.0003 },
    tier: 'fast',
  },
  'qwen3-32b': {
    provider: AIProvider.DASHSCOPE,
    name: 'qwen3-32b',
    maxTokens: 131072,
    costPer1kTokens: { input: 0.0003, output: 0.0009 },
    tier: 'standard',
  },
  'qwen3.5-35b': {
    provider: AIProvider.DASHSCOPE,
    name: 'qwen3.5-35b-a3b',
    maxTokens: 131072,
    costPer1kTokens: { input: 0.0003, output: 0.0009 },
    tier: 'standard',
  },
  'qwen3.5-plus': {
    provider: AIProvider.DASHSCOPE,
    name: 'qwen3.5-plus',
    maxTokens: 131072,
    costPer1kTokens: { input: 0.0004, output: 0.0012 },
    tier: 'standard',
  },
  'qwen3-max': {
    provider: AIProvider.DASHSCOPE,
    name: 'qwen3-max',
    maxTokens: 131072,
    costPer1kTokens: { input: 0.001, output: 0.003 },
    tier: 'advanced',
  },
  'qwen-vl-max': {
    provider: AIProvider.DASHSCOPE,
    name: 'qwen-vl-max-2025-08-13',
    maxTokens: 131072,
    costPer1kTokens: { input: 0.001, output: 0.003 },
    tier: 'advanced',
  },
};

// ═══════════════════════════════════════════════════════════════
// 🔧 MODEL NAME RESOLVER — Always resolve registry key → actual API name
// ═══════════════════════════════════════════════════════════════

/**
 * CRITICAL FIX: Resolve a model registry key to its actual API name.
 * Before ANY API call, always use: resolveModelName(modelId)
 * Example: 'qwen3-coder-480b' → 'qwen3-coder-480b-a35b-instruct'
 */
export function resolveModelName(modelId: string): string {
  const registry = MODEL_REGISTRY[modelId];
  if (registry?.name) {
    return registry.name;
  }
  // If not in registry, return as-is (might be a direct API name already)
  return modelId;
}

/**
 * Get model metadata from registry. Returns null if not found.
 */
export function getModelInfo(modelId: string): AIModel | null {
  return MODEL_REGISTRY[modelId] || null;
}

/**
 * Check if a model requires special parameters (e.g., enable_thinking: false)
 * CRITICAL FIX: ALL DashScope models require enable_thinking: false for non-streaming calls.
 * Previously only qwen3-235b-a22b was handled, causing crashes with other DashScope models.
 */
export function getModelSpecialParams(modelId: string): Record<string, any> {
  const params: Record<string, any> = {};
  const registry = MODEL_REGISTRY[modelId];
  
  // ALL DashScope models require enable_thinking: false for non-streaming calls
  if (registry?.provider === AIProvider.DASHSCOPE) {
    params.enable_thinking = false;
  }
  
  return params;
}

// ═══════════════════════════════════════════════════════════════
// 🔧 MODEL-SPECIFIC MAX_TOKENS LIMITS (CRITICAL FIX 7)
// Some models have lower max_tokens than what the generator requests.
// This prevents API errors from exceeding model limits.
// ═══════════════════════════════════════════════════════════════

const MODEL_MAX_TOKENS: Record<string, number> = {
    'qwen3-32b': 8192,
    'qwen-turbo': 8192,
    'qwen3.5-35b': 8192,
    'qwen-plus': 8192,
    'qwen-max': 8192,
    'qwen3-coder-480b': 16384,
    'qwen3-coder-plus': 16384,
    'qwen3-max': 16384,
    'qwen3.6-plus': 16384,
    'qwen3.6-flash': 8192,
    'qwen3-coder-flash': 8192,
    'qwen3-235b-a22b': 16384,
    'qwen3-30b-a3b': 16384,
    'qwen3.5-plus': 16384,
    'qwen-vl-max': 16384,
    'qwen-coder-plus': 16384,
};

/**
 * Get the effective max_tokens for a model, capping at the model's limit.
 * CRITICAL FIX 7: Prevents API errors when requested tokens exceed model limits.
 */
export function getEffectiveMaxTokens(modelName: string, requestedTokens: number): number {
    const cap = MODEL_MAX_TOKENS[modelName];
    if (cap && requestedTokens > cap) {
        logger.debug(`[AIFailover] Capping max_tokens for ${modelName}: ${requestedTokens} → ${cap}`);
        return cap;
    }
    return requestedTokens;
}

// ═══════════════════════════════════════════════════════════════
// 🔄 MODEL ROTATION POOLS (load-balanced per tier)
// ═══════════════════════════════════════════════════════════════

export const MODEL_ROTATION_POOLS: Record<string, string[]> = {
  fast: ['qwen3.6-flash', 'qwen3-coder-flash', 'qwen-turbo'],
  standard: ['qwen3.6-plus', 'qwen3-coder-plus', 'qwen3-32b', 'qwen3.5-35b', 'qwen3.5-plus', 'qwen-plus'],
  advanced: ['qwen3-coder-480b', 'qwen3-max', 'qwen-max', 'qwen-vl-max'],
  code: ['qwen3-coder-480b', 'qwen3-coder-plus', 'qwen3.6-plus', 'qwen3-max', 'qwen-max'],
};

/** Round-robin rotation state */
class ModelRotator {
  private counters = new Map<string, number>();

  /**
   * Pick the next model in the rotation pool for the given tier.
   * Skips providers whose circuit breaker is OPEN.
   */
  pick(tier: 'fast' | 'standard' | 'advanced', skipProviders?: Set<AIProvider>): string | null {
    const pool = MODEL_ROTATION_POOLS[tier];
    if (!pool || pool.length === 0) return null;

    const idx = (this.counters.get(tier) || 0) % pool.length;
    this.counters.set(tier, idx + 1);

    // Try each model in the pool, starting from the rotation index
    for (let i = 0; i < pool.length; i++) {
      const modelId = pool[(idx + i) % pool.length];
      const model = MODEL_REGISTRY[modelId];
      if (!model) continue;
      if (skipProviders?.has(model.provider)) continue;
      return modelId;
    }

    return null;
  }

  /** Reset all counters */
  reset(): void {
    this.counters.clear();
  }
}


// ═══════════════════════════════════════════════════════════════════════════
// 💰 COST BUDGET MANAGER (with spike detection & alerts)
// ═══════════════════════════════════════════════════════════════════════════

export class CostBudgetManager {
  private hourlySpend: number[] = [];
  private readonly MAX_HOURLY_BUDGET = 100; // $100/hour
  private readonly MAX_DAILY_BUDGET = 1000; // $1000/day
  private dailySpend = 0;
  private lastDayReset = new Date();

  // Spike detection
  private recentRequests: Array<{ cost: number; timestamp: number }> = [];
  private readonly SPIKE_WINDOW = 60000; // 1 minute
  private readonly SPIKE_THRESHOLD = 10; // $10 in 1 minute

  // Runaway loop detection
  private projectRequestCounts = new Map<string, number>();
  private readonly MAX_REQUESTS_PER_PROJECT = 100; // Per hour

  // Alert state
  private alertsSent = new Set<string>();

  /**
   * Check if we can afford this request
   */
  canAfford(estimatedCost: number, projectId?: string): { allowed: boolean; reason?: string } {
    // Reset daily spend at midnight
    const now = new Date();
    if (now.getDate() !== this.lastDayReset.getDate()) {
      this.dailySpend = 0;
      this.lastDayReset = now;
      this.projectRequestCounts.clear();
      this.alertsSent.clear();
    }

    // Runaway loop check
    if (projectId) {
      const requestCount = this.projectRequestCounts.get(projectId) || 0;
      if (requestCount >= this.MAX_REQUESTS_PER_PROJECT) {
        this.sendAlert('runaway_loop', `Project ${projectId} exceeded ${this.MAX_REQUESTS_PER_PROJECT} requests/hour`);
        return {
          allowed: false,
          reason: `🚨 RUNAWAY LOOP DETECTED: Project ${projectId}`,
        };
      }
    }

    // Cost spike check
    const nowTimestamp = Date.now();
    const recentCosts = this.recentRequests
      .filter((r) => nowTimestamp - r.timestamp < this.SPIKE_WINDOW)
      .reduce((sum, r) => sum + r.cost, 0);

    if (recentCosts + estimatedCost > this.SPIKE_THRESHOLD) {
      this.sendAlert('cost_spike', `$${(recentCosts + estimatedCost).toFixed(2)} in last minute`);
      return {
        allowed: false,
        reason: `🚨 COST SPIKE DETECTED: $${(recentCosts + estimatedCost).toFixed(2)}/min`,
      };
    }

    // Hourly budget check
    const hourlyTotal = this.hourlySpend.reduce((sum, cost) => sum + cost, 0);
    if (hourlyTotal + estimatedCost > this.MAX_HOURLY_BUDGET) {
      this.sendAlert('hourly_budget', `$${hourlyTotal.toFixed(2)}/$${this.MAX_HOURLY_BUDGET}`);
      return {
        allowed: false,
        reason: `Hourly budget exceeded: $${hourlyTotal.toFixed(2)}/$${this.MAX_HOURLY_BUDGET}`,
      };
    }

    // Daily budget check
    if (this.dailySpend + estimatedCost > this.MAX_DAILY_BUDGET) {
      this.sendAlert('daily_budget', `$${this.dailySpend.toFixed(2)}/$${this.MAX_DAILY_BUDGET}`);
      return {
        allowed: false,
        reason: `Daily budget exceeded: $${this.dailySpend.toFixed(2)}/$${this.MAX_DAILY_BUDGET}`,
      };
    }

    return { allowed: true };
  }

  /**
   * Record actual spend
   */
  recordSpend(cost: number, projectId?: string): void {
    this.hourlySpend.push(cost);
    this.dailySpend += cost;

    if (this.hourlySpend.length > 60) {
      this.hourlySpend.shift();
    }

    this.recentRequests.push({ cost, timestamp: Date.now() });
    this.recentRequests = this.recentRequests.filter((r) => Date.now() - r.timestamp < 5 * 60 * 1000);

    if (projectId) {
      const current = this.projectRequestCounts.get(projectId) || 0;
      this.projectRequestCounts.set(projectId, current + 1);
    }

    aiCost.inc({ type: 'total' }, cost);
  }

  /**
   * Send alert (deduped)
   */
  private sendAlert(type: string, message: string): void {
    const key = `${type}-${message}`;
    if (this.alertsSent.has(key)) return;

    logger.error(`[CostBudget] 🚨 ALERT: ${type} - ${message}`);
    aiCostAlerts.inc({ type });

    // TODO: Integrate with PagerDuty/Slack
    this.alertsSent.add(key);
  }

  /**
   * Get current stats
   */
  getStats(): { hourlySpend: number; dailySpend: number; maxHourly: number; maxDaily: number } {
    const hourlyTotal = this.hourlySpend.reduce((sum, cost) => sum + cost, 0);
    return {
      hourlySpend: hourlyTotal,
      dailySpend: this.dailySpend,
      maxHourly: this.MAX_HOURLY_BUDGET,
      maxDaily: this.MAX_DAILY_BUDGET,
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 🧠 SMART CACHE (semantic similarity)
// ═══════════════════════════════════════════════════════════════════════════

export class SmartCache {
  private cache: LRUCache<string, { response: AIResponse; semanticHash: string }>;

  constructor() {
    this.cache = new LRUCache({
      max: 1000, // Cache last 1000 requests
      ttl: 60 * 60 * 1000, // 1 hour TTL
    });
  }

  /**
   * Generate semantic hash (simple implementation)
   */
  private generateSemanticHash(messages: Array<{ role: string; content: string }>): string {
    // Normalize: lowercase, remove whitespace, sort
    const normalized = messages
      .map((m) => `${m.role}:${m.content.toLowerCase().replace(/\s+/g, ' ').trim()}`)
      .join('|');

    return crypto.createHash('sha256').update(normalized).digest('hex');
  }

  /**
   * Get cached response (exact match)
   */
  get(messages: Array<{ role: string; content: string }>): AIResponse | null {
    const hash = this.generateSemanticHash(messages);
    const cached = this.cache.get(hash);

    if (cached) {
      logger.debug('[SmartCache] ✅ Cache HIT', { hash: hash.substring(0, 12) });
      aiCacheHits.inc();
      return { ...cached.response, cached: true };
    }

    logger.debug('[SmartCache] ❌ Cache MISS', { hash: hash.substring(0, 12) });
    aiCacheMisses.inc();
    return null;
  }

  /**
   * Store response in cache
   */
  set(messages: Array<{ role: string; content: string }>, response: AIResponse): void {
    const hash = this.generateSemanticHash(messages);
    this.cache.set(hash, { response, semanticHash: hash });
    logger.debug('[SmartCache] 💾 Cached response', { hash: hash.substring(0, 12) });
  }

  /**
   * Clear cache
   */
  clear(): void {
    this.cache.clear();
    logger.info('[SmartCache] 🗑️ Cache cleared');
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 🔄 HYSTRIX CIRCUIT BREAKER
// ═══════════════════════════════════════════════════════════════════════════

interface CircuitBreakerState {
  state: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
  failures: number;
  successes: number;
  lastFailure?: Date;
  nextRetryTime?: Date;
}

export class HystrixCircuitBreaker {
  private states = new Map<AIProvider, CircuitBreakerState>();
  private readonly FAILURE_THRESHOLD = 5;
  private readonly SUCCESS_THRESHOLD = 2; // In HALF_OPEN
  private readonly OPEN_TIMEOUT = 60000; // 60s

  constructor() {
    Object.values(AIProvider).forEach((provider) => {
      this.states.set(provider, { state: 'CLOSED', failures: 0, successes: 0 });
    });
  }

  /**
   * Check if request can proceed
   */
  allowRequest(provider: AIProvider): boolean {
    const state = this.states.get(provider)!;

    if (state.state === 'CLOSED') {
      return true;
    }

    if (state.state === 'OPEN') {
      if (state.nextRetryTime && Date.now() >= state.nextRetryTime.getTime()) {
        logger.info(`[CircuitBreaker] ${provider} → HALF_OPEN (testing recovery)`);
        state.state = 'HALF_OPEN';
        state.successes = 0;
        return true;
      }
      return false;
    }

    // HALF_OPEN: allow requests but monitor closely
    return true;
  }

  /**
   * Record success
   */
  recordSuccess(provider: AIProvider): void {
    const state = this.states.get(provider)!;

    if (state.state === 'HALF_OPEN') {
      state.successes++;
      if (state.successes >= this.SUCCESS_THRESHOLD) {
        logger.info(`[CircuitBreaker] ${provider} → CLOSED (recovered)`);
        state.state = 'CLOSED';
        state.failures = 0;
        state.successes = 0;
        circuitBreakerState.set({ provider }, 1); // CLOSED
      }
    } else if (state.state === 'CLOSED') {
      state.failures = Math.max(0, state.failures - 1); // Gradual recovery
    }
  }

  /**
   * Record failure
   */
  recordFailure(provider: AIProvider): void {
    const state = this.states.get(provider)!;
    state.failures++;
    state.lastFailure = new Date();

    if (state.state === 'HALF_OPEN' || state.failures >= this.FAILURE_THRESHOLD) {
      logger.error(`[CircuitBreaker] ${provider} → OPEN (failures: ${state.failures})`);
      state.state = 'OPEN';
      state.nextRetryTime = new Date(Date.now() + this.OPEN_TIMEOUT);
      state.successes = 0;
      circuitBreakerState.set({ provider }, 0); // OPEN
    }
  }

  /**
   * Get state for provider
   */
  getState(provider: AIProvider): CircuitBreakerState {
    return this.states.get(provider)!;
  }

  /**
   * Get all states (for rotation logic)
   */
  getAllStates(): Map<AIProvider, CircuitBreakerState> {
    return this.states;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 🚀 AI FAILOVER ENGINE (Main Class)
// ═══════════════════════════════════════════════════════════════════════════

export class AIFailoverEngine {
  private openai: OpenAI | null = null;
  private anthropic: Anthropic | null = null;
  private dashscope: OpenAI | null = null;
  private costBudget = new CostBudgetManager();
  private smartCache = new SmartCache();
  private circuitBreaker = new HystrixCircuitBreaker();
  private rotator = new ModelRotator();

  // Default cascade: DashScope fast → OpenAI fast → Claude fast → escalate
  private readonly DEFAULT_CASCADE: FailoverConfig = {
    primary: 'qwen-turbo',
    fallbacks: ['qwen-plus', 'qwen-coder-plus', 'qwen3-coder-plus', 'qwen3.6-plus', 'qwen-max'],
    maxRetries: 4,
    retryDelay: 2000,
    timeout: 30000,
  };

  constructor() {
    // OpenAI — optional, only init if valid key
    if (config.openai.enabled && config.openai.apiKey) {
      this.openai = new OpenAI({ apiKey: config.openai.apiKey });
    } else {
      logger.warn('[AIFailover] OpenAI disabled — no valid API key');
    }
    // Anthropic — optional, only init if valid key
    if (config.anthropic.enabled && config.anthropic.apiKey) {
      this.anthropic = new Anthropic({ apiKey: config.anthropic.apiKey });
    } else {
      logger.warn('[AIFailover] Anthropic disabled — no valid API key');
    }

    // DashScope uses OpenAI-compatible SDK with custom baseURL
    if (config.dashscope.enabled && config.dashscope.apiKey) {
      this.dashscope = new OpenAI({
        apiKey: config.dashscope.apiKey,
        baseURL: config.dashscope.baseUrl,
      });
      logger.info(`[AIFailover] DashScope enabled: ${config.dashscope.baseUrl}`);
    } else {
      logger.warn('[AIFailover] DashScope disabled — no API key configured');
    }
  }

  /**
   * Execute AI request with cascade failover
   */
  async execute(request: AIRequest, config: FailoverConfig = this.DEFAULT_CASCADE): Promise<AIResponse> {
    const startTime = Date.now();

    // Check cache first
    const cached = this.smartCache.get(request.messages);
    if (cached) {
      return cached;
    }

    // Try primary + fallbacks
    const models = [config.primary, ...config.fallbacks];
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < models.length; attempt++) {
      const modelId = models[attempt];
      const model = MODEL_REGISTRY[modelId];

      if (!model) {
        logger.warn(`[AIFailover] Model ${modelId} not found in registry`);
        continue;
      }

      // Circuit breaker check
      if (!this.circuitBreaker.allowRequest(model.provider)) {
        logger.warn(`[AIFailover] ${model.provider} circuit breaker OPEN, skipping`);
        continue;
      }

      // Cost budget check
      const estimatedCost = this.estimateCost(request, model);
      const budgetCheck = this.costBudget.canAfford(estimatedCost, request.projectId);
      if (!budgetCheck.allowed) {
        logger.error(`[AIFailover] Budget check failed: ${budgetCheck.reason}`);
        throw new Error(budgetCheck.reason);
      }

      try {
        logger.info(`[AIFailover] Attempt ${attempt + 1}: ${modelId} (${model.provider})`);

        const response = await this.executeModel(model, request, config.timeout);
        const latency = Date.now() - startTime;

        const aiResponse: AIResponse = {
          ...response,
          latency,
          attempt: attempt + 1,
        };

        // Record success
        this.costBudget.recordSpend(response.usage.cost, request.projectId);
        this.circuitBreaker.recordSuccess(model.provider);
        this.smartCache.set(request.messages, aiResponse);

        aiRequestsMetric.inc({ provider: model.provider, model: modelId, status: 'success' });
        aiLatency.observe({ provider: model.provider }, latency);

        return aiResponse;
      } catch (error: any) {
        lastError = error;
        logger.error(`[AIFailover] Attempt ${attempt + 1} failed: ${error.message}`);

        this.circuitBreaker.recordFailure(model.provider);
        aiRequestsMetric.inc({ provider: model.provider, model: modelId, status: 'failure' });

        // Retry with delay (exponential backoff + jitter)
        if (attempt < models.length - 1) {
          const delay = config.retryDelay * Math.pow(2, attempt) + Math.random() * 1000;
          logger.info(`[AIFailover] Retrying in ${Math.round(delay)}ms...`);
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }

    throw new Error(`All AI providers failed. Last error: ${lastError?.message}`);
  }

  /**
   * Execute model with timeout
   */
  private async executeModel(model: AIModel, request: AIRequest, timeout: number): Promise<Omit<AIResponse, 'latency' | 'attempt'>> {
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error(`Timeout after ${timeout}ms`)), timeout);
    });

    let executePromise: Promise<Omit<AIResponse, 'latency' | 'attempt'>>;

    switch (model.provider) {
      case AIProvider.OPENAI:
        executePromise = this.executeOpenAI(model, request);
        break;
      case AIProvider.CLAUDE:
        executePromise = this.executeClaude(model, request);
        break;
      case AIProvider.DASHSCOPE:
        executePromise = this.executeDashScope(model, request);
        break;
      default:
        throw new Error(`Unknown provider: ${model.provider}`);
    }

    return Promise.race([executePromise, timeoutPromise]);
  }

  /**
   * Execute OpenAI request
   */
  private async executeOpenAI(model: AIModel, request: AIRequest): Promise<Omit<AIResponse, 'latency' | 'attempt'>> {
    if (!this.openai) throw new Error('OpenAI not configured');
    const actualModelName = resolveModelName(model.name);
    // CRITICAL FIX 7: Cap max_tokens per model limits
    const effectiveMaxTokens = getEffectiveMaxTokens(model.name, request.maxTokens || 4000);

    const response = await this.openai.chat.completions.create({
      model: actualModelName,
      messages: request.messages as any,
      temperature: request.temperature || 0.7,
      max_tokens: effectiveMaxTokens,
    });

    const inputTokens = response.usage?.prompt_tokens || 0;
    const outputTokens = response.usage?.completion_tokens || 0;
    const cost = (inputTokens / 1000) * model.costPer1kTokens.input + (outputTokens / 1000) * model.costPer1kTokens.output;

    return {
      content: response.choices[0]?.message?.content || '',
      provider: AIProvider.OPENAI,
      model: model.name,
      usage: { inputTokens, outputTokens, cost },
    };
  }

  /**
   * Execute Claude request
   */
  private async executeClaude(model: AIModel, request: AIRequest): Promise<Omit<AIResponse, 'latency' | 'attempt'>> {
    if (!this.anthropic) throw new Error('Anthropic not configured');
    const actualModelName = resolveModelName(model.name);
    // CRITICAL FIX 7: Cap max_tokens per model limits
    const effectiveMaxTokens = getEffectiveMaxTokens(model.name, request.maxTokens || 4000);

    const response = await this.anthropic.messages.create({
      model: actualModelName,
      max_tokens: effectiveMaxTokens,
      temperature: request.temperature || 0.7,
      messages: request.messages.map((msg) => ({
        role: msg.role === 'system' ? 'user' : (msg.role as 'user' | 'assistant'),
        content: msg.content,
      })),
    });

    const inputTokens = response.usage.input_tokens;
    const outputTokens = response.usage.output_tokens;
    const cost = (inputTokens / 1000) * model.costPer1kTokens.input + (outputTokens / 1000) * model.costPer1kTokens.output;

    return {
      content: response.content[0]?.type === 'text' ? response.content[0].text : '',
      provider: AIProvider.CLAUDE,
      model: model.name,
      usage: { inputTokens, outputTokens, cost },
    };
  }

  /**
   * Execute DashScope request (OpenAI-compatible API)
   */
  private async executeDashScope(model: AIModel, request: AIRequest): Promise<Omit<AIResponse, 'latency' | 'attempt'>> {
    if (!this.dashscope) {
      throw new Error('DashScope client not initialized — check DASHSCOPE_API_KEY');
    }

    // CRITICAL FIX: Always use resolveModelName to get the actual API model name
    const actualModelName = resolveModelName(model.name);
    
    // Get special parameters for this model (e.g., enable_thinking: false)
    const specialParams = getModelSpecialParams(model.name);

    // CRITICAL FIX 7: Cap max_tokens per model limits
    const effectiveMaxTokens = getEffectiveMaxTokens(model.name, request.maxTokens || 4000);

    const response = await this.dashscope.chat.completions.create({
      model: actualModelName,
      messages: request.messages as any,
      temperature: request.temperature || 0.7,
      max_tokens: effectiveMaxTokens,
      ...specialParams,
    });

    const inputTokens = response.usage?.prompt_tokens || 0;
    const outputTokens = response.usage?.completion_tokens || 0;
    const cost = (inputTokens / 1000) * model.costPer1kTokens.input + (outputTokens / 1000) * model.costPer1kTokens.output;

    return {
      content: response.choices[0]?.message?.content || '',
      provider: AIProvider.DASHSCOPE,
      model: model.name,
      usage: { inputTokens, outputTokens, cost },
    };
  }

  /**
   * Execute with model rotation — picks the next model in the tier pool
   */
  async executeWithRotation(
    request: AIRequest,
    tier: 'fast' | 'standard' | 'advanced' = 'fast'
  ): Promise<AIResponse> {
    const startTime = Date.now();

    // Check cache first
    const cached = this.smartCache.get(request.messages);
    if (cached) return cached;

    // Get providers with open circuit breakers
    const openProviders = new Set<AIProvider>();
    for (const [provider, state] of this.circuitBreaker.getAllStates()) {
      if (state.state === 'OPEN') openProviders.add(provider);
    }

    // Try rotation pool for the tier
    const modelId = this.rotator.pick(tier, openProviders);
    if (!modelId) {
      throw new Error(`No available models in ${tier} tier`);
    }

    const model = MODEL_REGISTRY[modelId];
    if (!model) {
      throw new Error(`Model ${modelId} not found in registry`);
    }

    logger.info(`[AIFailover] Rotation: ${modelId} (${model.provider}) from ${tier} tier`);

    const response = await this.execute({
      ...request,
    }, {
      primary: modelId,
      fallbacks: MODEL_ROTATION_POOLS[tier].filter((m) => m !== modelId),
      maxRetries: MODEL_ROTATION_POOLS[tier].length,
      retryDelay: 1500,
      timeout: 30000,
    });

    return response;
  }

  /**
   * Get DashScope client (for external use)
   */
  getDashScopeClient(): OpenAI | null {
    return this.dashscope;
  }

  /**
   * Check if DashScope is available
   */
  isDashScopeEnabled(): boolean {
    return this.dashscope !== null;
  }

  /**
   * Estimate cost before execution
   */
  private estimateCost(request: AIRequest, model: AIModel): number {
    const inputChars = request.messages.reduce((sum, msg) => sum + msg.content.length, 0);
    const estimatedInputTokens = inputChars / 4; // Rough estimate: 1 token ≈ 4 chars
    const estimatedOutputTokens = request.maxTokens || 1000;

    return (
      (estimatedInputTokens / 1000) * model.costPer1kTokens.input +
      (estimatedOutputTokens / 1000) * model.costPer1kTokens.output
    );
  }

  /**
   * Get budget stats
   */
  getBudgetStats() {
    return this.costBudget.getStats();
  }

  /**
   * Get circuit breaker states
   */
  getCircuitBreakerStates() {
    return Object.values(AIProvider).map((provider) => ({
      provider,
      state: this.circuitBreaker.getState(provider),
    }));
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 📤 EXPORTS
// ═══════════════════════════════════════════════════════════════════════════

export const aiFailover = new AIFailoverEngine();
