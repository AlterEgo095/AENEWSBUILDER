/**
 * Orchestrator - AI Control Plane
 * Ghost Classifier + Planner + Decision Engine
 */

import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { config } from '../config/env.js';
import { CacheService } from './redis.service.js';
import { logger } from '../config/logger.js';

const openai: OpenAI | null = config.openai.enabled ? new OpenAI({ apiKey: config.openai.apiKey }) : null;
const anthropic: Anthropic | null = config.anthropic.enabled ? new Anthropic({ apiKey: config.anthropic.apiKey }) : null;

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
  model: 'qwen3-coder-480b' | 'qwen-max' | 'qwen3.6-plus' | 'qwen-turbo' | 'qwen3.6-flash' | 'qwen3-32b' | 'qwen3.5-35b' | 'qwen-vl-max' | 'qwen-plus' | 'qwq-32b' | 'qwen-long' | 'gpt-4o' | 'gpt-4o-mini' | 'claude-sonnet' | 'claude-opus';
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
            model: 'qwen3.6-plus',
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: prompt },
            ],
            temperature: 0.3,
            max_tokens: 500,
            response_format: { type: 'json_object' },
          });
          content = response.choices[0]?.message?.content || '';
          usedModel = 'qwen3.6-plus';
        } catch (dsError) {
          logger.warn({ error: dsError }, '⚠️ DashScope classification failed, falling back to OpenAI');
        }
      }

      // Fallback to OpenAI (if available)
      if (!content && openai) {
        try {
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
        } catch (error) {
          logger.warn({ error }, 'OpenAI classification failed, using defaults');
        }
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
            model: 'qwen-max',
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userMessage },
            ],
            temperature: 0.2,
            max_tokens: 4000,
          });
          content = response.choices[0]?.message?.content || '';
          usedModel = 'qwen-max';
        } catch (dsError) {
          logger.warn({ error: dsError }, '⚠️ DashScope planning failed, falling back to Anthropic');
        }
      }

      // Fallback to Anthropic Claude Sonnet (if available)
      if (!content && anthropic) {
        try {
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
        } catch (error) {
          logger.warn({ error }, 'Anthropic planning failed, using defaults');
        }
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
// 🧠 MULTI-MODEL DECISION ENGINE (8 Specialized Models)
// ============================================

export class DecisionEngine {
  /**
   * Multi-model decision: each model has a specialized role
   * 
   * ROLES:
   * 1. qwen3-coder-480b → PRIMARY CODE GENERATOR (480B params, code-specialized)
   * 2. qwen-max → ARCHITECT (best reasoning for complex files)
   * 3. qwen3.6-plus → REVIEWER + CLASSIFIER (smart, fast)
   * 4. QWEN-turbo → SIMPLE FILES (config, styles, tiny components)
   * 5. qwen3.6-flash → AUTO-HEALING first pass (ultra fast)
   * 6. qwen3-32b → CONTEXT SUMMARIZER (mid-size, good compression)
   * 7. qwen-vl-max → VISUAL DESIGN (Figma screenshots → code)
   * 8. qwen3.5-35b → BACKUP GENERATOR (MoE 35B, solid mid-tier)
   */
  decide(classification: ProjectClassification, fileSpec: FileSpec): DecisionResult {
    let model: DecisionResult['model'] = 'qwen3-coder-480b';
    let estimatedCost = 0.002;
    let reasoning = '';

    // ── Code generation routing ─────────────────────────────────
    // PRIMARY: qwen3-coder-480b for ALL code files (480B params!)
    if (fileSpec.type === 'component' || fileSpec.type === 'page') {
      // React/Vue components and pages → use the beast
      model = 'qwen3-coder-480b';
      estimatedCost = 0.002;
      reasoning = 'Component/Page → qwen3-coder-480b (480B code-specialized)';
    } else if (fileSpec.type === 'api') {
      if (classification.complexity === 'complex') {
        // Complex API → best reasoning model
        model = 'qwen-max';
        estimatedCost = 0.004;
        reasoning = 'Complex API → qwen-max (best reasoning)';
      } else {
        model = 'qwen3-coder-480b';
        estimatedCost = 0.002;
        reasoning = 'Standard API → qwen3-coder-480b (code-specialized)';
      }
    } else if (fileSpec.type === 'config' || fileSpec.type === 'style') {
      // Config/style → fastest cheapest
      model = 'qwen-turbo';
      estimatedCost = 0.0003;
      reasoning = 'Config/Style → qwen-turbo (fastest)';
    } else if (classification.complexity === 'complex') {
      // Complex other files → qwen-max for reasoning
      model = 'qwen-max';
      estimatedCost = 0.004;
      reasoning = 'Complex file → qwen-max (advanced reasoning)';
    } else {
      // Default → 480B code model
      model = 'qwen3-coder-480b';
      estimatedCost = 0.002;
      reasoning = 'Standard → qwen3-coder-480b (code-specialized)';
    }

    // ── MCP tool selection ──────────────────────────────────────
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
    if (classification.features.includes('database') || classification.features.includes('supabase')) {
      mcpTools.push('supabase');
    }

    return { model, mcpTools, estimatedCost, reasoning };
  }

  /**
   * Get the model for a specific ROLE (used by other workers)
   */
  getRoleModel(role: 'classifier' | 'planner' | 'generator' | 'reviewer' | 'healer' | 'summarizer' | 'visual'): string {
    const roleModelMap: Record<string, string> = {
      classifier: 'qwen3.6-plus',     // Smart + fast for classification
      planner: 'qwen-max',            // Best reasoning for architecture
      generator: 'qwen3-coder-480b',  // 480B code-specialized monster
      reviewer: 'qwen3.6-plus',       // Smart reviewer
      healer: 'qwen3.6-flash',        // Ultra fast first-pass healing
      summarizer: 'qwen3-32b',        // Good compression for context
      visual: 'qwen-vl-max',          // Vision model for design
    };
    return roleModelMap[role] || 'qwen3.6-plus';
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
