/**
 * AI Failover Strategy - Multi-provider resilience
 * Features: OpenAI ↔ Claude automatic failover, intelligent retry
 * @module services/ai-failover
 */

import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { LRUCache } from 'lru-cache';
import crypto from 'crypto';
import { logger } from '../config/logger.js';
import { env } from '../config/env.js';

export enum AIProvider {
  OPENAI = 'openai',
  CLAUDE = 'claude',
}

export interface AIModel {
  provider: AIProvider;
  name: string;
  maxTokens: number;
  costPer1kTokens: { input: number; output: number };
  tier: 'fast' | 'standard' | 'advanced';
}

// ================== MODEL REGISTRY ==================

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
};

// ================== FAILOVER STRATEGY ==================

export interface FailoverConfig {
  primary: string; // Model ID
  fallbacks: string[]; // Ordered list of fallback models
  maxRetries: number;
  retryDelay: number; // milliseconds
  timeout: number; // milliseconds
}

export interface AIRequest {
  messages: Array<{ role: string; content: string }>;
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
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
}

// ================== GLOBAL COST BUDGET ==================

export class CostBudgetManager {
  private hourlySpend: number[] = []; // Circular buffer for last hour
  private readonly MAX_HOURLY_BUDGET = 100; // $100/hour
  private readonly MAX_DAILY_BUDGET = 1000; // $1000/day
  private dailySpend = 0;
  private lastDayReset = new Date();

  /**
   * Check if we can afford this request
   */
  canAfford(estimatedCost: number): { allowed: boolean; reason?: string } {
    // Reset daily spend at midnight
    const now = new Date();
    if (now.getDate() !== this.lastDayReset.getDate()) {
      this.dailySpend = 0;
      this.lastDayReset = now;
    }

    // Calculate hourly spend
    const hourlyTotal = this.hourlySpend.reduce((sum, cost) => sum + cost, 0);

    // Check hourly budget
    if (hourlyTotal + estimatedCost > this.MAX_HOURLY_BUDGET) {
      return {
        allowed: false,
        reason: `Hourly budget exceeded: $${hourlyTotal.toFixed(2)}/$${this.MAX_HOURLY_BUDGET}`,
      };
    }

    // Check daily budget
    if (this.dailySpend + estimatedCost > this.MAX_DAILY_BUDGET) {
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
  recordSpend(cost: number) {
    this.hourlySpend.push(cost);
    this.dailySpend += cost;

    // Keep only last hour (60 entries)
    if (this.hourlySpend.length > 60) {
      this.hourlySpend.shift();
    }
  }

  /**
   * Get budget status
   */
  getStatus() {
    const hourlyTotal = this.hourlySpend.reduce((sum, cost) => sum + cost, 0);
    return {
      hourly: {
        spent: hourlyTotal,
        limit: this.MAX_HOURLY_BUDGET,
        remaining: Math.max(0, this.MAX_HOURLY_BUDGET - hourlyTotal),
      },
      daily: {
        spent: this.dailySpend,
        limit: this.MAX_DAILY_BUDGET,
        remaining: Math.max(0, this.MAX_DAILY_BUDGET - this.dailySpend),
      },
    };
  }
}

export const costBudgetManager = new CostBudgetManager();

// ================== AI RESPONSE CACHE ==================

interface CacheEntry {
  content: string;
  provider: AIProvider;
  model: string;
  usage: {
    inputTokens: number;
    outputTokens: number;
    cost: number;
  };
  timestamp: Date;
}

export class AIResponseCache {
  private cache = new LRUCache<string, CacheEntry>({
    max: 1000, // Store 1000 responses
    ttl: 60 * 60 * 1000, // 1 hour TTL
    updateAgeOnGet: true,
  });

  /**
   * Generate cache key from request
   */
  private generateKey(request: AIRequest, modelName: string): string {
    const payload = {
      messages: request.messages,
      temperature: request.temperature,
      maxTokens: request.maxTokens,
      model: modelName,
    };
    return crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');
  }

  /**
   * Get cached response
   */
  get(request: AIRequest, modelName: string): CacheEntry | undefined {
    const key = this.generateKey(request, modelName);
    const cached = this.cache.get(key);

    if (cached) {
      logger.info('✅ Cache HIT', { model: modelName, age: Date.now() - cached.timestamp.getTime() });
    }

    return cached;
  }

  /**
   * Store response in cache
   */
  set(request: AIRequest, modelName: string, response: Omit<AIResponse, 'latency' | 'attempt'>) {
    const key = this.generateKey(request, modelName);
    this.cache.set(key, {
      ...response,
      timestamp: new Date(),
    });
  }

  /**
   * Get cache stats
   */
  getStats() {
    return {
      size: this.cache.size,
      maxSize: this.cache.max,
      hitRate: this.cache.size > 0 ? (this.cache.size / (this.cache.max || 1)) * 100 : 0,
    };
  }
}

export const aiResponseCache = new AIResponseCache();

// ================== AI FAILOVER ==================

export class AIFailover {
  private openai: OpenAI;
  private anthropic: Anthropic;

  // Health tracking
  private providerHealth = new Map<AIProvider, {
    consecutiveFailures: number;
    lastFailure?: Date;
    circuitBreakerOpen: boolean;
  }>();

  private readonly CIRCUIT_BREAKER_THRESHOLD = 2; // Reduced from 5 to 2
  private readonly CIRCUIT_BREAKER_RESET_TIME = 60000; // 1 minute

  constructor() {
    this.openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });
    this.anthropic = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

    // Initialize health tracking
    this.providerHealth.set(AIProvider.OPENAI, {
      consecutiveFailures: 0,
      circuitBreakerOpen: false,
    });
    this.providerHealth.set(AIProvider.CLAUDE, {
      consecutiveFailures: 0,
      circuitBreakerOpen: false,
    });
  }

  /**
   * Execute AI request with automatic failover (+ cache + budget)
   */
  async complete(
    request: AIRequest,
    config: FailoverConfig
  ): Promise<AIResponse> {
    const models = [config.primary, ...config.fallbacks];

    // 1. Check cache first
    const primaryModel = MODEL_REGISTRY[config.primary];
    if (primaryModel) {
      const cached = aiResponseCache.get(request, primaryModel.name);
      if (cached) {
        logger.info('⚡ Returning cached AI response', { model: primaryModel.name });
        return {
          ...cached,
          latency: 0,
          attempt: 0,
        };
      }
    }

    // 2. Estimate cost and check budget
    const estimatedTokens = JSON.stringify(request.messages).length / 4; // Rough estimate
    const estimatedCost = primaryModel
      ? (estimatedTokens / 1000) * primaryModel.costPer1kTokens.input * 2 // x2 for output
      : 0.01;

    const budgetCheck = costBudgetManager.canAfford(estimatedCost);
    if (!budgetCheck.allowed) {
      logger.error('❌ AI request blocked by budget', {
        estimatedCost,
        reason: budgetCheck.reason,
      });
      throw new Error(`Budget exceeded: ${budgetCheck.reason}`);
    }

    let lastError: Error | null = null;

    for (let attempt = 0; attempt < config.maxRetries; attempt++) {
      const modelId = models[Math.min(attempt, models.length - 1)];
      const model = MODEL_REGISTRY[modelId];

      if (!model) {
        logger.error('Model not found in registry', { modelId });
        continue;
      }

      // Check circuit breaker
      const health = this.providerHealth.get(model.provider);
      if (health?.circuitBreakerOpen) {
        if (this.shouldResetCircuitBreaker(health)) {
          this.resetCircuitBreaker(model.provider);
        } else {
          logger.warn('Circuit breaker open, skipping provider', {
            provider: model.provider,
          });
          continue;
        }
      }

      try {
        const startTime = Date.now();

        const response = await this.executeRequest(model, request, config.timeout);

        const latency = Date.now() - startTime;

        // Success - reset failure count
        this.recordSuccess(model.provider);

        // Record actual spend
        costBudgetManager.recordSpend(response.usage.cost);

        // Cache the response
        aiResponseCache.set(request, model.name, response);

        logger.info('AI request successful', {
          provider: model.provider,
          model: model.name,
          attempt: attempt + 1,
          latency,
        });

        return {
          ...response,
          latency,
          attempt: attempt + 1,
        };
      } catch (error: any) {
        lastError = error;

        // Detect rate-limit errors (429/503)
        const isRateLimit = error.status === 429 || error.status === 503;
        if (isRateLimit) {
          logger.warn('Rate limit detected - applying special backoff', {
            provider: model.provider,
            status: error.status,
          });
          // Wait longer for rate limits (exponential backoff x2)
          if (attempt < config.maxRetries - 1) {
            const delay = config.retryDelay * Math.pow(2, attempt) * 2; // x2 multiplier
            await this.sleep(delay);
          }
        }

        // Record failure
        this.recordFailure(model.provider);

        logger.error('AI request failed', {
          provider: model.provider,
          model: model.name,
          attempt: attempt + 1,
          error: error.message,
        });

        // Wait before retry
        if (attempt < config.maxRetries - 1) {
          const delay = config.retryDelay * Math.pow(2, attempt);
          await this.sleep(delay);
        }
      }
    }

    throw new Error(
      `All AI providers failed after ${config.maxRetries} attempts: ${lastError?.message}`
    );
  }

  /**
   * Execute request on specific provider
   */
  private async executeRequest(
    model: AIModel,
    request: AIRequest,
    timeout: number
  ): Promise<Omit<AIResponse, 'latency' | 'attempt'>> {
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('Request timeout')), timeout);
    });

    const requestPromise =
      model.provider === AIProvider.OPENAI
        ? this.executeOpenAI(model, request)
        : this.executeClaude(model, request);

    return Promise.race([requestPromise, timeoutPromise]);
  }

  /**
   * Execute OpenAI request
   */
  private async executeOpenAI(
    model: AIModel,
    request: AIRequest
  ): Promise<Omit<AIResponse, 'latency' | 'attempt'>> {
    const response = await this.openai.chat.completions.create({
      model: model.name,
      messages: request.messages as any,
      temperature: request.temperature || 0.7,
      max_tokens: request.maxTokens || 4000,
      stream: false,
    });

    const inputTokens = response.usage?.prompt_tokens || 0;
    const outputTokens = response.usage?.completion_tokens || 0;

    const cost =
      (inputTokens / 1000) * model.costPer1kTokens.input +
      (outputTokens / 1000) * model.costPer1kTokens.output;

    return {
      content: response.choices[0]?.message?.content || '',
      provider: AIProvider.OPENAI,
      model: model.name,
      usage: {
        inputTokens,
        outputTokens,
        cost,
      },
    };
  }

  /**
   * Execute Claude request
   */
  private async executeClaude(
    model: AIModel,
    request: AIRequest
  ): Promise<Omit<AIResponse, 'latency' | 'attempt'>> {
    const response = await this.anthropic.messages.create({
      model: model.name,
      max_tokens: request.maxTokens || 4000,
      temperature: request.temperature || 0.7,
      messages: request.messages.map((msg) => ({
        role: msg.role === 'system' ? 'user' : msg.role,
        content: msg.content,
      })) as any,
    });

    const inputTokens = response.usage.input_tokens;
    const outputTokens = response.usage.output_tokens;

    const cost =
      (inputTokens / 1000) * model.costPer1kTokens.input +
      (outputTokens / 1000) * model.costPer1kTokens.output;

    return {
      content:
        response.content[0]?.type === 'text'
          ? response.content[0].text
          : '',
      provider: AIProvider.CLAUDE,
      model: model.name,
      usage: {
        inputTokens,
        outputTokens,
        cost,
      },
    };
  }

  /**
   * Record successful request
   */
  private recordSuccess(provider: AIProvider) {
    const health = this.providerHealth.get(provider);
    if (health) {
      health.consecutiveFailures = 0;
      health.circuitBreakerOpen = false;
    }
  }

  /**
   * Record failed request
   */
  private recordFailure(provider: AIProvider) {
    const health = this.providerHealth.get(provider);
    if (health) {
      health.consecutiveFailures++;
      health.lastFailure = new Date();

      if (health.consecutiveFailures >= this.CIRCUIT_BREAKER_THRESHOLD) {
        health.circuitBreakerOpen = true;
        logger.warn('Circuit breaker opened', {
          provider,
          failures: health.consecutiveFailures,
        });
      }
    }
  }

  /**
   * Check if circuit breaker should be reset
   */
  private shouldResetCircuitBreaker(health: {
    consecutiveFailures: number;
    lastFailure?: Date;
    circuitBreakerOpen: boolean;
  }): boolean {
    if (!health.lastFailure) return true;

    const timeSinceLastFailure = Date.now() - health.lastFailure.getTime();
    return timeSinceLastFailure > this.CIRCUIT_BREAKER_RESET_TIME;
  }

  /**
   * Reset circuit breaker
   */
  private resetCircuitBreaker(provider: AIProvider) {
    const health = this.providerHealth.get(provider);
    if (health) {
      health.consecutiveFailures = 0;
      health.circuitBreakerOpen = false;
      logger.info('Circuit breaker reset', { provider });
    }
  }

  /**
   * Get provider health status
   */
  getHealthStatus() {
    const status: Record<string, any> = {};

    for (const [provider, health] of this.providerHealth.entries()) {
      status[provider] = {
        healthy: !health.circuitBreakerOpen,
        consecutiveFailures: health.consecutiveFailures,
        lastFailure: health.lastFailure?.toISOString(),
      };
    }

    return status;
  }

  /**
   * Sleep utility
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

export const aiFailover = new AIFailover();

// ================== DEFAULT CONFIGURATIONS ==================

export const DEFAULT_FAILOVER_CONFIGS = {
  // Fast classification/simple tasks
  fast: {
    primary: 'gpt-4o-mini',
    fallbacks: ['claude-3-haiku'],
    maxRetries: 3,
    retryDelay: 1000,
    timeout: 30000,
  },

  // Standard generation tasks
  standard: {
    primary: 'claude-3-sonnet',
    fallbacks: ['gpt-4o', 'gpt-4-turbo'],
    maxRetries: 3,
    retryDelay: 2000,
    timeout: 60000,
  },

  // Complex reasoning tasks
  advanced: {
    primary: 'claude-3-opus',
    fallbacks: ['gpt-4-turbo', 'claude-3-sonnet'],
    maxRetries: 3,
    retryDelay: 3000,
    timeout: 120000,
  },
} as const;
