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
const cache = new CacheService();

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
  model: 'gpt-4o' | 'gpt-4o-mini' | 'claude-sonnet' | 'claude-opus';
  mcpTools: string[];
  estimatedCost: number;
  reasoning: string;
}

// ============================================
// 🧠 GHOST CLASSIFIER (Ultra Cheap)
// ============================================

export class GhostClassifier {
  /**
   * Classify project using GPT-4o-mini (cached)
   */
  async classify(prompt: string): Promise<ProjectClassification> {
    const cacheKey = cache.generateKey('classification', prompt);
    
    // Check cache
    const cached = await cache.get<ProjectClassification>(cacheKey);
    if (cached) {
      logger.info('✅ Classification cache hit');
      return cached;
    }

    try {
      const response = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: `You are a project classification expert. Analyze the project description and return a JSON object with:
- complexity: "simple" | "medium" | "complex"
- type: "landing" | "webapp" | "ecommerce" | "dashboard" | "api" | "other"
- features: string[] (key features detected)
- estimatedFiles: number (estimated number of files)
- recommendedStack: string[] (recommended technologies)

Return ONLY valid JSON, no explanations.`,
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        temperature: 0.3,
        max_tokens: 500,
        response_format: { type: 'json_object' },
      });

      const classification = JSON.parse(
        response.choices[0].message.content || '{}'
      ) as ProjectClassification;

      // Cache for 24h
      await cache.set(cacheKey, classification, config.cache.ttl.classification);

      logger.info({ classification }, '✅ Project classified');
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
   * Generate detailed project plan using Claude Sonnet (cached)
   */
  async generatePlan(
    prompt: string,
    classification: ProjectClassification
  ): Promise<ProjectPlan> {
    const cacheKey = cache.generateKey('plan', { prompt, classification });
    
    // Check cache
    const cached = await cache.get<ProjectPlan>(cacheKey);
    if (cached) {
      logger.info('✅ Plan cache hit');
      return cached;
    }

    try {
      const response = await anthropic.messages.create({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 4000,
        temperature: 0.2,
        system: `You are an expert software architect. Generate a detailed project plan based on the classification.
Return a JSON object with:
- files: Array of {path, type, description, dependencies, priority}
- dependencies: Object with package names and versions
- steps: Array of {id, name, type, description, dependencies}
- mcpTools: Array of MCP tools to use (figma, notion, playwright, cloudflare, replicate)
- estimatedCost: Estimated cost in USD
- estimatedTime: Estimated time in minutes

Return ONLY valid JSON.`,
        messages: [
          {
            role: 'user',
            content: `Project: ${prompt}\n\nClassification: ${JSON.stringify(classification)}`,
          },
        ],
      });

      const content = response.content[0];
      if (content.type !== 'text') {
        throw new Error('Unexpected response type');
      }

      const plan = JSON.parse(content.text) as ProjectPlan;

      // Cache for 1h
      await cache.set(cacheKey, plan, config.cache.ttl.plan);

      logger.info({ plan }, '✅ Plan generated');
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
    let model: DecisionResult['model'] = 'gpt-4o-mini';
    let estimatedCost = 0.001;
    let reasoning = '';

    // Decision logic based on complexity and file type
    if (classification.complexity === 'complex' && fileSpec.type === 'api') {
      model = 'claude-opus';
      estimatedCost = 0.015;
      reasoning = 'Complex API requires Claude Opus';
    } else if (classification.complexity === 'medium') {
      model = 'claude-sonnet';
      estimatedCost = 0.005;
      reasoning = 'Medium complexity uses Claude Sonnet';
    } else if (fileSpec.type === 'config' || fileSpec.type === 'style') {
      model = 'gpt-4o-mini';
      estimatedCost = 0.0005;
      reasoning = 'Simple config/style uses GPT-4o-mini';
    } else {
      model = 'gpt-4o';
      estimatedCost = 0.002;
      reasoning = 'Standard generation uses GPT-4o';
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
