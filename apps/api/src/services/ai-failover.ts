/**
 * AI Failover Strategy - Multi-provider resilience
 * Features: OpenAI ↔ Claude automatic failover, intelligent retry
 * @module services/ai-failover
 */

import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
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

export class AIFailover {
  private openai: OpenAI;
  private anthropic: Anthropic;

  // Health tracking
  private providerHealth = new Map<AIProvider, {
    consecutiveFailures: number;
    lastFailure?: Date;
    circuitBreakerOpen: boolean;
  }>();

  private readonly CIRCUIT_BREAKER_THRESHOLD = 5;
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
   * Execute AI request with automatic failover
   */
  async complete(
    request: AIRequest,
    config: FailoverConfig
  ): Promise<AIResponse> {
    const models = [config.primary, ...config.fallbacks];

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
