/**
 * Orchestrator - AI Control Plane
 * Ghost Classifier + Planner + Decision Engine
 */

import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { config } from '../config/env.js';
import { CacheService } from './redis.service.js';
import { logger } from '../config/logger.js';
import { resolveModelName, getModelSpecialParams } from './ai-failover.js';

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
  model: 'qwen3-coder-480b' | 'qwen3-coder-plus' | 'qwen3-max' | 'qwen-max' | 'qwen3.6-plus' | 'qwen-turbo' | 'qwen3.6-flash' | 'qwen3-32b' | 'qwen3.5-35b' | 'qwen3.5-plus' | 'qwen-vl-max' | 'qwen-plus' | 'qwen-coder-plus' | 'gpt-4o' | 'claude-sonnet' | 'claude-opus';
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
          const classifierModel = resolveModelName('qwen-turbo');
          const specialParams = getModelSpecialParams('qwen-turbo');
          const response = await dashscope.chat.completions.create({
            model: classifierModel,
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: prompt },
            ],
            temperature: 0.3,
            max_tokens: 500,
            response_format: { type: 'json_object' },
            ...specialParams,
          });
          content = response.choices[0]?.message?.content || '';
          usedModel = 'qwen-turbo';
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

      // Clean markdown fences if the model wrapped JSON (qwen-turbo sometimes does)
      let cleanContent = (content || '').trim();
      if (cleanContent.startsWith('```')) {
        cleanContent = cleanContent.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
      }

      const classification = JSON.parse(cleanContent || '{}') as ProjectClassification;

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
          const plannerModel = resolveModelName('qwen3.6-plus');
          const specialParams = getModelSpecialParams('qwen3.6-plus');
          const response = await dashscope.chat.completions.create({
            model: plannerModel,
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userMessage },
            ],
            temperature: 0.2,
            max_tokens: 4000,
            ...specialParams,
          });
          content = response.choices[0]?.message?.content || '';
          usedModel = 'qwen3.6-plus';
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

      // Clean markdown fences if the model wrapped JSON
      let cleanPlanContent = (content || '').trim();
      if (cleanPlanContent.startsWith('```')) {
        cleanPlanContent = cleanPlanContent.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
      }

      const plan = JSON.parse(cleanPlanContent) as ProjectPlan;

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

    // ── Multi-Model Specialization Strategy ───────────────────────
    // Each model has a precise role in the pipeline:
    // 
    // CLASSIFICATION:  qwen-turbo (fastest, cheapest, perfect for JSON extraction)
    // PLANNING:        qwen3.6-plus (smart planning, good cost/quality ratio)
    // CODE GEN:        qwen3-coder-480b (480B params, code-specialized beast)
    // COMPLEX CODE:    qwen3-max (best reasoning for complex logic)
    // BACKUP CODE:     qwen3-coder-plus (solid code gen, cheaper than 480b)
    // REVIEW:          qwen3.6-plus (smart reviewer, balanced)
    // AUTO-HEAL:       qwen3.6-flash (ultra fast first-pass healing)
    // CONFIG/STYLE:    qwen-turbo (fastest for trivial files)
    // VISUAL:          qwen-vl-max (vision model for design screenshots)
    
    if (fileSpec.type === 'component' || fileSpec.type === 'page') {
      if (classification.complexity === 'complex') {
        // Complex React/Vue pages → best reasoning
        model = 'qwen3-max';
        estimatedCost = 0.003;
        reasoning = 'Complex Page → qwen3-max (advanced reasoning)';
      } else {
        // Standard components → code-specialized beast
        model = 'qwen3-coder-480b';
        estimatedCost = 0.002;
        reasoning = 'Component → qwen3-coder-480b (480B code-specialized)';
      }
    } else if (fileSpec.type === 'api') {
      if (classification.complexity === 'complex') {
        model = 'qwen3-max';
        estimatedCost = 0.003;
        reasoning = 'Complex API → qwen3-max (best reasoning)';
      } else {
        model = 'qwen3-coder-plus';
        estimatedCost = 0.001;
        reasoning = 'Standard API → qwen3-coder-plus (code-specialized)';
      }
    } else if (fileSpec.type === 'config') {
      // Config files → fastest cheapest
      model = 'qwen-turbo';
      estimatedCost = 0.0002;
      reasoning = 'Config → qwen-turbo (fastest, cheapest)';
    } else if (fileSpec.type === 'style') {
      // Styles → fast but decent quality
      model = 'qwen3.6-flash';
      estimatedCost = 0.0001;
      reasoning = 'Style → qwen3.6-flash (fast, good quality)';
    } else if (classification.complexity === 'complex') {
      model = 'qwen3-coder-plus';
      estimatedCost = 0.001;
      reasoning = 'Complex file → qwen3-coder-plus (solid backup)';
    } else {
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
      classifier: 'qwen-turbo',       // Fastest + cheapest, perfect for JSON extraction
      planner: 'qwen3.6-plus',       // Smart planning, good cost/quality ratio
      generator: 'qwen3-coder-480b',  // 480B code-specialized beast
      reviewer: 'qwen3.6-plus',       // Smart reviewer, balanced
      healer: 'qwen3.6-flash',        // Ultra fast first-pass healing
      summarizer: 'qwen3-32b',        // Good compression for context
      visual: 'qwen-vl-max',          // Vision model for design
      architect: 'qwen3-max',          // Best reasoning for complex architecture
      backup: 'qwen3-coder-plus',     // Solid code gen backup
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
