/**
 * AENEWS BUILDER v3.0 — Unified AI Client
 * Inspired by z-ai-sdk-python architecture patterns
 * 
 * Single entry point for ALL AI operations:
 * - Chat completions (with streaming)
 * - Code generation
 * - Code refinement
 * - Analysis/classification
 * 
 * Multi-provider with strategy pattern:
 * - DashScope (Qwen models) — primary
 * - OpenAI (GPT models) — fallback
 * - Anthropic (Claude models) — fallback
 * - DeepSeek — low-cost alternative
 * - Gemini — Google alternative
 * - Ollama — local/self-hosted
 */

import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';

// ============================================================
// TYPES
// ============================================================

export type AIProvider = 'dashscope' | 'openai' | 'anthropic' | 'deepseek' | 'gemini' | 'ollama';

export interface AIModel {
  id: string;
  name: string;
  provider: AIProvider;
  tier: 'fast' | 'standard' | 'advanced' | 'code';
  maxTokens: number;
  maxOutputTokens: number;
  costPer1kInput: number;
  costPer1kOutput: number;
  supportsStreaming: boolean;
  supportsVision: boolean;
  supportsTools: boolean;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  name?: string;
  toolCallId?: string;
}

export interface CompletionOptions {
  model?: string;
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  stream?: boolean;
  signal?: AbortSignal;
  timeout?: number;
  responseFormat?: { type: 'text' | 'json_object' };
  tools?: any[];
}

export interface CompletionResult {
  content: string;
  model: string;
  provider: AIProvider;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  finishReason: string;
  latency: number;
  cached: boolean;
}

export interface StreamChunk {
  content: string;
  model: string;
  provider: AIProvider;
  finishReason?: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
  };
}

export interface ProviderConfig {
  apiKey: string;
  baseUrl: string;
  enabled: boolean;
  priority: number;
  rateLimit: { rpm: number; tpm: number };
}

export interface UnifiedAIConfig {
  providers: Partial<Record<AIProvider, ProviderConfig>>;
  defaultProvider?: AIProvider;
  defaultModel?: string;
  cascadeOrder?: AIProvider[];
  circuitBreaker: {
    failureThreshold: number;
    recoveryTimeout: number;
    halfOpenRequests: number;
  };
  costBudget: {
    hourlyLimit: number;
    dailyLimit: number;
    perRequestLimit: number;
  };
  cache: {
    enabled: boolean;
    maxSize: number;
    ttlSeconds: number;
  };
  retry: {
    maxAttempts: number;
    initialDelayMs: number;
    maxDelayMs: number;
  };
}

// ============================================================
// MODEL REGISTRY
// ============================================================

const MODEL_REGISTRY: AIModel[] = [
  // DashScope (Qwen) — Primary
  { id: 'qwen3-coder-480b', name: 'Qwen3 Coder 480B', provider: 'dashscope', tier: 'code', maxTokens: 131072, maxOutputTokens: 16384, costPer1kInput: 0.004, costPer1kOutput: 0.012, supportsStreaming: true, supportsVision: false, supportsTools: true },
  { id: 'qwen-max', name: 'Qwen Max', provider: 'dashscope', tier: 'advanced', maxTokens: 32768, maxOutputTokens: 8192, costPer1kInput: 0.004, costPer1kOutput: 0.012, supportsStreaming: true, supportsVision: false, supportsTools: true },
  { id: 'qwen-plus', name: 'Qwen Plus', provider: 'dashscope', tier: 'standard', maxTokens: 131072, maxOutputTokens: 8192, costPer1kInput: 0.002, costPer1kOutput: 0.006, supportsStreaming: true, supportsVision: false, supportsTools: true },
  { id: 'qwen-turbo', name: 'Qwen Turbo', provider: 'dashscope', tier: 'fast', maxTokens: 131072, maxOutputTokens: 8192, costPer1kInput: 0.0005, costPer1kOutput: 0.002, supportsStreaming: true, supportsVision: false, supportsTools: true },
  { id: 'qwen3-32b', name: 'Qwen3 32B', provider: 'dashscope', tier: 'standard', maxTokens: 32768, maxOutputTokens: 8192, costPer1kInput: 0.001, costPer1kOutput: 0.002, supportsStreaming: true, supportsVision: false, supportsTools: true },
  
  // OpenAI
  { id: 'gpt-4o', name: 'GPT-4o', provider: 'openai', tier: 'advanced', maxTokens: 128000, maxOutputTokens: 16384, costPer1kInput: 0.005, costPer1kOutput: 0.015, supportsStreaming: true, supportsVision: true, supportsTools: true },
  { id: 'gpt-4o-mini', name: 'GPT-4o Mini', provider: 'openai', tier: 'standard', maxTokens: 128000, maxOutputTokens: 16384, costPer1kInput: 0.00015, costPer1kOutput: 0.0006, supportsStreaming: true, supportsVision: true, supportsTools: true },
  { id: 'o3-mini', name: 'O3 Mini', provider: 'openai', tier: 'code', maxTokens: 200000, maxOutputTokens: 100000, costPer1kInput: 0.003, costPer1kOutput: 0.012, supportsStreaming: true, supportsVision: false, supportsTools: true },
  
  // Anthropic
  { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet', provider: 'anthropic', tier: 'advanced', maxTokens: 200000, maxOutputTokens: 8192, costPer1kInput: 0.003, costPer1kOutput: 0.015, supportsStreaming: true, supportsVision: true, supportsTools: true },
  { id: 'claude-3-haiku-20240307', name: 'Claude 3 Haiku', provider: 'anthropic', tier: 'fast', maxTokens: 200000, maxOutputTokens: 4096, costPer1kInput: 0.00025, costPer1kOutput: 0.00125, supportsStreaming: true, supportsVision: true, supportsTools: true },
  
  // DeepSeek — OpenAI-compatible
  { id: 'deepseek-chat', name: 'DeepSeek Chat', provider: 'deepseek', tier: 'standard', maxTokens: 64000, maxOutputTokens: 8192, costPer1kInput: 0.00014, costPer1kOutput: 0.00028, supportsStreaming: true, supportsVision: false, supportsTools: true },
  { id: 'deepseek-coder', name: 'DeepSeek Coder', provider: 'deepseek', tier: 'code', maxTokens: 64000, maxOutputTokens: 16384, costPer1kInput: 0.00014, costPer1kOutput: 0.00028, supportsStreaming: true, supportsVision: false, supportsTools: true },
  
  // Gemini
  { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash', provider: 'gemini', tier: 'fast', maxTokens: 1048576, maxOutputTokens: 8192, costPer1kInput: 0.0, costPer1kOutput: 0.0, supportsStreaming: true, supportsVision: true, supportsTools: true },
  { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro', provider: 'gemini', tier: 'advanced', maxTokens: 1048576, maxOutputTokens: 65536, costPer1kInput: 0.00125, costPer1kOutput: 0.005, supportsStreaming: true, supportsVision: true, supportsTools: true },
  
  // Ollama — local, free
  { id: 'llama3.1:70b', name: 'Llama 3.1 70B', provider: 'ollama', tier: 'advanced', maxTokens: 131072, maxOutputTokens: 8192, costPer1kInput: 0.0, costPer1kOutput: 0.0, supportsStreaming: true, supportsVision: false, supportsTools: true },
  { id: 'codellama:34b', name: 'CodeLlama 34B', provider: 'ollama', tier: 'code', maxTokens: 16384, maxOutputTokens: 8192, costPer1kInput: 0.0, costPer1kOutput: 0.0, supportsStreaming: true, supportsVision: false, supportsTools: false },
];

// ============================================================
// PROVIDER ADAPTERS (Strategy Pattern)
// ============================================================

interface ProviderAdapter {
  provider: AIProvider;
  client: any;
  complete(options: CompletionOptions): Promise<CompletionResult>;
  stream(options: CompletionOptions): AsyncIterable<StreamChunk>;
  isAvailable(): boolean;
  getModelMaxTokens(modelId: string): number;
}

// OpenAI-Compatible Adapter (DashScope, DeepSeek, Ollama all use this)
class OpenAICompatibleAdapter implements ProviderAdapter {
  provider: AIProvider;
  client: OpenAI;
  private config: ProviderConfig;

  constructor(provider: AIProvider, config: ProviderConfig) {
    this.provider = provider;
    this.config = config;
    this.client = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseUrl,
      timeout: 120000,
      maxRetries: 0, // We handle retries ourselves
    });
  }

  isAvailable(): boolean {
    return this.config.enabled && !!this.config.apiKey;
  }

  getModelMaxTokens(modelId: string): number {
    const model = MODEL_REGISTRY.find(m => m.id === modelId && m.provider === this.provider);
    return model?.maxOutputTokens || 8192;
  }

  async complete(options: CompletionOptions): Promise<CompletionResult> {
    const startTime = Date.now();
    const maxTokens = Math.min(
      options.maxTokens || 8192,
      this.getModelMaxTokens(options.model || '')
    );

    const params: any = {
      model: options.model,
      messages: options.messages,
      temperature: options.temperature ?? 0.7,
      max_tokens: maxTokens,
      top_p: options.topP,
      stream: false,
    };

    // DashScope requires enable_thinking: false for non-streaming
    if (this.provider === 'dashscope') {
      params.extra_body = { enable_thinking: false };
    }

    if (options.responseFormat) {
      params.response_format = options.responseFormat;
    }

    const response = await this.client.chat.completions.create(params);

    return {
      content: response.choices[0]?.message?.content || '',
      model: response.model,
      provider: this.provider,
      usage: {
        promptTokens: response.usage?.prompt_tokens || 0,
        completionTokens: response.usage?.completion_tokens || 0,
        totalTokens: response.usage?.total_tokens || 0,
      },
      finishReason: response.choices[0]?.finish_reason || 'stop',
      latency: Date.now() - startTime,
      cached: false,
    };
  }

  async *stream(options: CompletionOptions): AsyncIterable<StreamChunk> {
    const maxTokens = Math.min(
      options.maxTokens || 8192,
      this.getModelMaxTokens(options.model || '')
    );

    const params: any = {
      model: options.model,
      messages: options.messages,
      temperature: options.temperature ?? 0.7,
      max_tokens: maxTokens,
      stream: true,
    };

    const stream = await this.client.chat.completions.create(params);

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content || '';
      if (content) {
        yield {
          content,
          model: chunk.model || options.model || '',
          provider: this.provider,
          finishReason: chunk.choices[0]?.finish_reason,
        };
      }
    }
  }
}

// Anthropic Adapter
class AnthropicAdapter implements ProviderAdapter {
  provider: AIProvider = 'anthropic';
  client: Anthropic;
  private config: ProviderConfig;

  constructor(config: ProviderConfig) {
    this.config = config;
    this.client = new Anthropic({ apiKey: config.apiKey });
  }

  isAvailable(): boolean {
    return this.config.enabled && !!this.config.apiKey;
  }

  getModelMaxTokens(modelId: string): number {
    const model = MODEL_REGISTRY.find(m => m.id === modelId);
    return model?.maxOutputTokens || 4096;
  }

  async complete(options: CompletionOptions): Promise<CompletionResult> {
    const startTime = Date.now();
    const maxTokens = Math.min(options.maxTokens || 4096, this.getModelMaxTokens(options.model || ''));

    const response = await this.client.messages.create({
      model: options.model || 'claude-3-5-sonnet-20241022',
      messages: options.messages.filter(m => m.role !== 'system').map(m => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      })),
      system: options.messages.find(m => m.role === 'system')?.content,
      max_tokens: maxTokens,
      temperature: options.temperature ?? 0.7,
    });

    return {
      content: response.content[0]?.type === 'text' ? response.content[0].text : '',
      model: response.model,
      provider: this.provider,
      usage: {
        promptTokens: response.usage.input_tokens,
        completionTokens: response.usage.output_tokens,
        totalTokens: response.usage.input_tokens + response.usage.output_tokens,
      },
      finishReason: response.stop_reason || 'stop',
      latency: Date.now() - startTime,
      cached: false,
    };
  }

  async *stream(options: CompletionOptions): AsyncIterable<StreamChunk> {
    const maxTokens = Math.min(options.maxTokens || 4096, this.getModelMaxTokens(options.model || ''));

    const stream = this.client.messages.stream({
      model: options.model || 'claude-3-5-sonnet-20241022',
      messages: options.messages.filter(m => m.role !== 'system').map(m => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      })),
      system: options.messages.find(m => m.role === 'system')?.content,
      max_tokens: maxTokens,
      temperature: options.temperature ?? 0.7,
    });

    for await (const event of stream) {
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        yield {
          content: event.delta.text,
          model: options.model || 'claude-3-5-sonnet-20241022',
          provider: this.provider,
        };
      }
    }
  }
}

// Gemini Adapter (using OpenAI-compatible endpoint)
class GeminiAdapter implements ProviderAdapter {
  provider: AIProvider = 'gemini';
  client: OpenAI;
  private config: ProviderConfig;

  constructor(config: ProviderConfig) {
    this.config = config;
    // Gemini supports OpenAI-compatible API via generativelanguage.googleapis.com
    this.client = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseUrl || 'https://generativelanguage.googleapis.com/v1beta/openai/',
      timeout: 120000,
    });
  }

  isAvailable(): boolean { return this.config.enabled && !!this.config.apiKey; }

  getModelMaxTokens(modelId: string): number {
    const model = MODEL_REGISTRY.find(m => m.id === modelId);
    return model?.maxOutputTokens || 8192;
  }

  async complete(options: CompletionOptions): Promise<CompletionResult> {
    const startTime = Date.now();
    const response = await this.client.chat.completions.create({
      model: options.model || 'gemini-2.0-flash',
      messages: options.messages,
      temperature: options.temperature ?? 0.7,
      max_tokens: Math.min(options.maxTokens || 8192, this.getModelMaxTokens(options.model || '')),
    });

    return {
      content: response.choices[0]?.message?.content || '',
      model: response.model,
      provider: this.provider,
      usage: {
        promptTokens: response.usage?.prompt_tokens || 0,
        completionTokens: response.usage?.completion_tokens || 0,
        totalTokens: response.usage?.total_tokens || 0,
      },
      finishReason: response.choices[0]?.finish_reason || 'stop',
      latency: Date.now() - startTime,
      cached: false,
    };
  }

  async *stream(options: CompletionOptions): AsyncIterable<StreamChunk> {
    const stream = await this.client.chat.completions.create({
      model: options.model || 'gemini-2.0-flash',
      messages: options.messages,
      temperature: options.temperature ?? 0.7,
      stream: true,
    });

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content || '';
      if (content) {
        yield { content, model: chunk.model || '', provider: this.provider };
      }
    }
  }
}

// ============================================================
// CIRCUIT BREAKER
// ============================================================

interface CircuitState {
  status: 'closed' | 'open' | 'half-open';
  failures: number;
  lastFailure: number;
  successes: number;
}

// ============================================================
// SMART CACHE
// ============================================================

interface CacheEntry {
  result: CompletionResult;
  timestamp: number;
  hits: number;
}

// ============================================================
// UNIFIED AI CLIENT
// ============================================================

export class UnifiedAIClient {
  private adapters: Map<AIProvider, ProviderAdapter> = new Map();
  private circuits: Map<AIProvider, CircuitState> = new Map();
  private cache: Map<string, CacheEntry> = new Map();
  private config: UnifiedAIConfig;
  private costTracker: { hourly: number; daily: number; hourlyReset: number; dailyReset: number };

  constructor(config?: Partial<UnifiedAIConfig>) {
    this.config = {
      providers: {},
      defaultProvider: 'dashscope',
      defaultModel: 'qwen3-coder-480b',
      cascadeOrder: ['dashscope', 'openai', 'anthropic', 'deepseek', 'gemini', 'ollama'],
      circuitBreaker: { failureThreshold: 5, recoveryTimeout: 60000, halfOpenRequests: 2 },
      costBudget: { hourlyLimit: 100, dailyLimit: 1000, perRequestLimit: 10 },
      cache: { enabled: true, maxSize: 1000, ttlSeconds: 3600 },
      retry: { maxAttempts: 3, initialDelayMs: 1000, maxDelayMs: 30000 },
      ...config,
    };

    this.costTracker = { hourly: 0, daily: 0, hourlyReset: Date.now() + 3600000, dailyReset: Date.now() + 86400000 };
    this.initializeAdapters();
  }

  private initializeAdapters() {
    const envProviders: Record<string, { key: string; url: string; enabled: boolean }> = {
      dashscope: { key: process.env.DASHSCOPE_API_KEY || '', url: process.env.DASHSCOPE_BASE_URL || 'https://dashscope.aliyuncs.com/compatible-mode/v1', enabled: process.env.DASHSCOPE_ENABLED !== 'false' },
      openai: { key: process.env.OPENAI_API_KEY || '', url: 'https://api.openai.com/v1', enabled: !!process.env.OPENAI_API_KEY },
      anthropic: { key: process.env.ANTHROPIC_API_KEY || '', url: 'https://api.anthropic.com', enabled: !!process.env.ANTHROPIC_API_KEY },
      deepseek: { key: process.env.DEEPSEEK_API_KEY || '', url: 'https://api.deepseek.com/v1', enabled: !!process.env.DEEPSEEK_API_KEY },
      gemini: { key: process.env.GEMINI_API_KEY || '', url: 'https://generativelanguage.googleapis.com/v1beta/openai/', enabled: !!process.env.GEMINI_API_KEY },
      ollama: { key: 'ollama', url: process.env.OLLAMA_BASE_URL || 'http://localhost:11434/v1', enabled: process.env.OLLAMA_ENABLED === 'true' },
    };

    for (const [name, cfg] of Object.entries(envProviders)) {
      if (!cfg.enabled) continue;
      const providerConfig: ProviderConfig = {
        apiKey: cfg.key, baseUrl: cfg.url, enabled: cfg.enabled,
        priority: this.config.cascadeOrder!.indexOf(name as AIProvider),
        rateLimit: { rpm: 60, tpm: 100000 },
      };

      switch (name) {
        case 'anthropic':
          this.adapters.set('anthropic', new AnthropicAdapter(providerConfig));
          break;
        case 'gemini':
          this.adapters.set('gemini', new GeminiAdapter(providerConfig));
          break;
        default:
          this.adapters.set(name as AIProvider, new OpenAICompatibleAdapter(name as AIProvider, providerConfig));
      }

      this.circuits.set(name as AIProvider, {
        status: 'closed', failures: 0, lastFailure: 0, successes: 0,
      });
    }
  }

  // ---- Main API: Complete (non-streaming) ----
  async complete(options: CompletionOptions): Promise<CompletionResult> {
    // Check cache
    if (this.config.cache.enabled) {
      const cacheKey = this.getCacheKey(options);
      const cached = this.cache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < this.config.cache.ttlSeconds * 1000) {
        cached.hits++;
        return { ...cached.result, cached: true };
      }
    }

    // Check cost budget
    this.resetCostTrackerIfNeeded();
    if (this.costTracker.hourly >= this.config.costBudget.hourlyLimit) {
      throw new Error('Hourly cost budget exceeded');
    }

    // Try cascade
    const cascadeOrder = this.config.cascadeOrder!.filter(p => this.isProviderAvailable(p));
    const model = options.model || this.config.defaultModel!;
    const modelInfo = MODEL_REGISTRY.find(m => m.id === model);

    // If requested model's provider is available, try it first
    if (modelInfo && this.isProviderAvailable(modelInfo.provider)) {
      const reordered = [modelInfo.provider, ...cascadeOrder.filter(p => p !== modelInfo.provider)];
      return this.tryCascade(reordered, options);
    }

    return this.tryCascade(cascadeOrder, options);
  }

  // ---- Main API: Stream (token-by-token) ----
  async *stream(options: CompletionOptions): AsyncIterable<StreamChunk> {
    const model = options.model || this.config.defaultModel!;
    const modelInfo = MODEL_REGISTRY.find(m => m.id === model);
    const cascadeOrder = this.config.cascadeOrder!.filter(p => this.isProviderAvailable(p));

    let provider: AIProvider | undefined;
    if (modelInfo && this.isProviderAvailable(modelInfo.provider)) {
      provider = modelInfo.provider;
    } else {
      provider = cascadeOrder[0];
    }

    if (!provider) throw new Error('No AI provider available');

    const adapter = this.adapters.get(provider);
    if (!adapter) throw new Error(`No adapter for provider: ${provider}`);

    yield* adapter.stream({ ...options, model });
  }

  // ---- Cascade with retry ----
  private async tryCascade(providers: AIProvider[], options: CompletionOptions): Promise<CompletionResult> {
    let lastError: Error | null = null;

    for (const provider of providers) {
      if (!this.isProviderAvailable(provider)) continue;

      const adapter = this.adapters.get(provider);
      if (!adapter) continue;

      // Try with retries
      for (let attempt = 0; attempt < this.config.retry.maxAttempts; attempt++) {
        try {
          const result = await adapter.complete(options);
          this.recordSuccess(provider);
          this.trackCost(result.usage.totalTokens, result.provider);

          // Cache result
          if (this.config.cache.enabled) {
            const cacheKey = this.getCacheKey(options);
            this.cache.set(cacheKey, { result, timestamp: Date.now(), hits: 0 });
            if (this.cache.size > this.config.cache.maxSize) {
              const oldest = [...this.cache.entries()].sort((a, b) => a[1].timestamp - b[1].timestamp)[0];
              this.cache.delete(oldest[0]);
            }
          }

          return result;
        } catch (error: any) {
          lastError = error;
          this.recordFailure(provider);

          // Don't retry on auth errors
          if (error?.status === 401 || error?.status === 403) break;

          // Wait before retry
          if (attempt < this.config.retry.maxAttempts - 1) {
            const delay = Math.min(
              this.config.retry.initialDelayMs * Math.pow(2, attempt) + Math.random() * 500,
              this.config.retry.maxDelayMs
            );
            await new Promise(r => setTimeout(r, delay));
          }
        }
      }
    }

    throw lastError || new Error('All providers failed');
  }

  // ---- Provider availability (circuit breaker) ----
  private isProviderAvailable(provider: AIProvider): boolean {
    const adapter = this.adapters.get(provider);
    if (!adapter || !adapter.isAvailable()) return false;

    const circuit = this.circuits.get(provider);
    if (!circuit) return false;

    if (circuit.status === 'closed') return true;
    if (circuit.status === 'open') {
      // Check if recovery timeout has passed
      if (Date.now() - circuit.lastFailure > this.config.circuitBreaker.recoveryTimeout) {
        circuit.status = 'half-open';
        return true;
      }
      return false;
    }
    // half-open: allow limited requests
    return circuit.successes < this.config.circuitBreaker.halfOpenRequests;
  }

  private recordSuccess(provider: AIProvider) {
    const circuit = this.circuits.get(provider);
    if (!circuit) return;
    circuit.successes++;
    if (circuit.status === 'half-open' && circuit.successes >= this.config.circuitBreaker.halfOpenRequests) {
      circuit.status = 'closed';
      circuit.failures = 0;
    }
  }

  private recordFailure(provider: AIProvider) {
    const circuit = this.circuits.get(provider);
    if (!circuit) return;
    circuit.failures++;
    circuit.lastFailure = Date.now();
    if (circuit.failures >= this.config.circuitBreaker.failureThreshold) {
      circuit.status = 'open';
    }
  }

  // ---- Cost tracking ----
  private trackCost(tokens: number, provider: AIProvider) {
    const model = MODEL_REGISTRY.find(m => m.provider === provider);
    const cost = (tokens / 1000) * (model?.costPer1kOutput || 0);
    this.costTracker.hourly += cost;
    this.costTracker.daily += cost;
  }

  private resetCostTrackerIfNeeded() {
    const now = Date.now();
    if (now > this.costTracker.hourlyReset) {
      this.costTracker.hourly = 0;
      this.costTracker.hourlyReset = now + 3600000;
    }
    if (now > this.costTracker.dailyReset) {
      this.costTracker.daily = 0;
      this.costTracker.dailyReset = now + 86400000;
    }
  }

  // ---- Cache ----
  private getCacheKey(options: CompletionOptions): string {
    const { messages, model, temperature, maxTokens } = options;
    const hash = JSON.stringify({ messages, model, temperature, maxTokens });
    return hash.slice(0, 64); // Simple hash — could use crypto for better distribution
  }

  // ---- Utility: Get model info ----
  getModel(modelId: string): AIModel | undefined {
    return MODEL_REGISTRY.find(m => m.id === modelId);
  }

  getModelsByProvider(provider: AIProvider): AIModel[] {
    return MODEL_REGISTRY.filter(m => m.provider === provider);
  }

  getModelsByTier(tier: AIModel['tier']): AIModel[] {
    return MODEL_REGISTRY.filter(m => m.tier === tier);
  }

  getAvailableProviders(): AIProvider[] {
    return [...this.adapters.keys()].filter(p => this.isProviderAvailable(p));
  }

  getCircuitStatus(): Record<string, CircuitState> {
    return Object.fromEntries(this.circuits);
  }

  getCostStatus() {
    this.resetCostTrackerIfNeeded();
    return { hourly: this.costTracker.hourly, daily: this.costTracker.daily };
  }
}

// Singleton instance
let _instance: UnifiedAIClient | null = null;

export function getUnifiedAIClient(): UnifiedAIClient {
  if (!_instance) {
    _instance = new UnifiedAIClient();
  }
  return _instance;
}

export { MODEL_REGISTRY };
