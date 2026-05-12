/**
 * Orchestrator - AI Control Plane
 * Ghost Classifier + Planner + Decision Engine
 */

import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { config } from '../config/env.js';
import { CacheService } from './redis.service.js';
import { logger } from '../config/logger.js';

const openai = new OpenAI({ apiKey: config.openai.apiKey });
const anthropic = new Anthropic({ apiKey: config.anthropic.apiKey });

// DashScope client (OpenAI-compatible with custom baseURL)
let dashscope: OpenAI | null = null;
if (config.dashscope.enabled && config.dashscope.apiKey) {
  dashscope = new OpenAI({
    apiKey: config.dashscope.apiKey,
    baseURL: config.dashscope.baseUrl,
  });
  logger.info(`[Orchestrator] DashScope enabled: ${config.dashscope.baseUrl}`);
}
let _cache: CacheService | null = null;
function getCache(): CacheService {
  if (!_cache) {
    _cache = new CacheService();
  }
  return _cache;
}

// ============================================
// 🔹 TYPES
// ============================================

export interface ProjectClassification {
  complexity: 'simple' | 'medium' | 'complex';
  type: 'landing' | 'webapp' | 'ecommerce' | 'dashboard' | 'api' | 'other';
  features: string[];
  estimatedFiles: number;
  recommendedStack: string[];
}

export interface ProjectPlan {
  files: FileSpec[];
  dependencies: Record<string, string>;
  steps: Step[];
  mcpTools: string[];
  estimatedCost: number;
  estimatedTime: number;
}

export interface FileSpec {
  path: string;
  type: 'component' | 'page' | 'api' | 'config' | 'style' | 'other';
  description: string;
  dependencies: string[];
  priority: number;
}

export interface Step {
  id: string;
  name: string;
  type: 'analysis' | 'design' | 'generation' | 'mcp' | 'test' | 'deploy';
  description: string;
  dependencies: string[];
}

export interface DecisionResult {
  model: 'gpt-4o' | 'gpt-4o-mini' | 'claude-sonnet' | 'claude-opus' | 'qwen-turbo' | 'qwen-plus' | 'qwen-max' | 'qwq-32b' | 'qwen-long';
  mcpTools: string[];
  estimatedCost: number;
  reasoning: string;
}

// ============================================
// 🧠 GHOST CLASSIFIER (Ultra Cheap)
// ============================================

export class GhostClassifier {
  /**
   * Classify project using the cheapest available model (cached).
   * Priority: DashScope qwen-turbo → OpenAI gpt-4o-mini → Anthropic claude-3-haiku
   */
  async classify(prompt: string): Promise<ProjectClassification> {
    const cacheKey = getCache().generateKey('classification', prompt);
    
    // Check cache
    const cached = await getCache().get<ProjectClassification>(cacheKey);
    if (cached) {
      logger.info('✅ Classification cache hit');
      return cached;
    }

    const systemPrompt = `You are a project classification expert. Analyze the project description and return a JSON object with:
- complexity: "simple" | "medium" | "complex"
- type: "landing" | "webapp" | "ecommerce" | "dashboard" | "api" | "other"
- features: string[] (key features detected)
- estimatedFiles: number (estimated number of files)
- recommendedStack: string[] (recommended technologies)

Return ONLY valid JSON, no explanations.`;

    try {
      let content: string;
      let usedModel = 'unknown';

      // Try DashScope first (cheapest and fastest)
      if (dashscope) {
        try {
          const response = await dashscope.chat.completions.create({
            model: 'qwen-turbo',
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: prompt },
            ],
            temperature: 0.3,
            max_tokens: 500,
            response_format: { type: 'json_object' },
          });
          content = response.choices[0]?.message?.content || '';
          usedModel = 'qwen-turbo';
        } catch (dsError) {
          logger.warn({ error: dsError }, '⚠️ DashScope classification failed, falling back to OpenAI');
        }
      }

      // Fallback to OpenAI
      if (!content) {
        const response = await openai.chat.completions.create({
          model: 'gpt-4o-mini',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: prompt },
          ],
          temperature: 0.3,
          max_tokens: 500,
          response_format: { type: 'json_object' },
        });
        content = response.choices[0]?.message?.content || '';
        usedModel = 'gpt-4o-mini';
      }

      const classification = JSON.parse(content || '{}') as ProjectClassification;

      // Cache for 24h
      await getCache().set(cacheKey, classification, config.cache.ttl.classification);

      logger.info({ classification, model: usedModel }, '✅ Project classified');
      return classification;

    } catch (error) {
      logger.error({ error }, '❌ Classification failed');
      throw error;
    }
  }
}

// ============================================
// 🧠 PLANNER (Claude Sonnet)
// ============================================

export class Planner {
  /**
   * Generate detailed project plan (cached).
   * Priority: DashScope qwen-plus → Anthropic Claude Sonnet → OpenAI gpt-4o
   */
  async generatePlan(
    prompt: string,
    classification: ProjectClassification
  ): Promise<ProjectPlan> {
    const cacheKey = getCache().generateKey('plan', { prompt, classification });
    
    // Check cache
    const cached = await getCache().get<ProjectPlan>(cacheKey);
    if (cached) {
      logger.info('✅ Plan cache hit');
      return cached;
    }

    const systemPrompt = `You are an expert software architect. Generate a detailed project plan based on the classification.
Return a JSON object with:
- files: Array of {path, type, description, dependencies, priority}
- dependencies: Object with package names and versions
- steps: Array of {id, name, type, description, dependencies}
- mcpTools: Array of MCP tools to use (figma, notion, playwright, cloudflare, replicate)
- estimatedCost: Estimated cost in USD
- estimatedTime: Estimated time in minutes

Return ONLY valid JSON.`;

    const userMessage = `Project: ${prompt}\n\nClassification: ${JSON.stringify(classification)}`;

    try {
      let content: string;
      let usedModel = 'unknown';

      // Try DashScope qwen-plus first (good quality, lower cost)
      if (dashscope) {
        try {
          const response = await dashscope.chat.completions.create({
            model: 'qwen-plus',
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userMessage },
            ],
            temperature: 0.2,
            max_tokens: 4000,
          });
          content = response.choices[0]?.message?.content || '';
          usedModel = 'qwen-plus';
        } catch (dsError) {
          logger.warn({ error: dsError }, '⚠️ DashScope planning failed, falling back to Anthropic');
        }
      }

      // Fallback to Anthropic Claude Sonnet
      if (!content) {
        const response = await anthropic.messages.create({
          model: 'claude-3-5-sonnet-20241022',
          max_tokens: 4000,
          temperature: 0.2,
          system: systemPrompt,
          messages: [
            { role: 'user', content: userMessage },
          ],
        });

        const respContent = response.content[0];
        if (respContent.type !== 'text') {
          throw new Error('Unexpected Claude response type');
        }
        content = respContent.text;
        usedModel = 'claude-3-5-sonnet';
      }

      const plan = JSON.parse(content) as ProjectPlan;

      // Cache for 1h
      await getCache().set(cacheKey, plan, config.cache.ttl.plan);

      logger.info({ plan, model: usedModel }, '✅ Plan generated');
      return plan;

    } catch (error) {
      logger.error({ error }, '❌ Plan generation failed');
      throw error;
    }
  }
}

// ============================================
// 🧠 DECISION ENGINE
// ============================================

export class DecisionEngine {
  /**
   * Decide which model to use for generation
   */
  decide(classification: ProjectClassification, fileSpec: FileSpec): DecisionResult {
    let model: DecisionResult['model'] = 'qwen-turbo';
    let estimatedCost = 0.0003;
    let reasoning = '';

    // Decision logic based on complexity and file type
    // DashScope models are preferred (cheaper, same quality)
    if (classification.complexity === 'complex' && fileSpec.type === 'api') {
      model = 'qwen-max';
      estimatedCost = 0.004;
      reasoning = 'Complex API uses Qwen-Max (DashScope advanced)';
    } else if (classification.complexity === 'complex') {
      model = 'qwq-32b';
      estimatedCost = 0.002;
      reasoning = 'Complex logic uses QwQ-32B reasoning model (DashScope)';
    } else if (classification.complexity === 'medium') {
      model = 'qwen-plus';
      estimatedCost = 0.001;
      reasoning = 'Medium complexity uses Qwen-Plus (DashScope standard)';
    } else if (fileSpec.type === 'config' || fileSpec.type === 'style') {
      model = 'qwen-turbo';
      estimatedCost = 0.0003;
      reasoning = 'Simple config/style uses Qwen-Turbo (DashScope fast)';
    } else {
      model = 'qwen3-235b-a22b';
      estimatedCost = 0.001;
      reasoning = 'Standard generation uses Qwen3-235B (DashScope)';
    }

    // Select MCP tools based on features
    const mcpTools: string[] = [];
    if (classification.features.includes('design') || classification.features.includes('figma')) {
      mcpTools.push('figma');
    }
    if (classification.features.includes('cms') || classification.features.includes('content')) {
      mcpTools.push('notion');
    }
    if (classification.features.includes('deploy')) {
      mcpTools.push('cloudflare');
    }

    return {
      model,
      mcpTools,
      estimatedCost,
      reasoning,
    };
  }
}

// ============================================
// 🚀 ORCHESTRATOR FACADE
// ============================================

export class Orchestrator {
  private classifier: GhostClassifier;
  private planner: Planner;
  private decisionEngine: DecisionEngine;

  constructor() {
    this.classifier = new GhostClassifier();
    this.planner = new Planner();
    this.decisionEngine = new DecisionEngine();
  }

  async process(prompt: string) {
    // Step 1: Classify
    const classification = await this.classifier.classify(prompt);

    // Step 2: Generate Plan
    const plan = await this.planner.generatePlan(prompt, classification);

    // Step 3: Make Decisions for each file
    const decisions = plan.files.map((file) => ({
      file: file.path,
      decision: this.decisionEngine.decide(classification, file),
    }));

    return {
      classification,
      plan,
      decisions,
      totalEstimatedCost: decisions.reduce((sum, d) => sum + d.decision.estimatedCost, 0),
    };
  }
}
