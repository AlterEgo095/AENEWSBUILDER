/**
 * Generator - Context-Aware Incremental File Generation
 * 
 * v2.0 — Adds context awareness:
 * - Each `generateFile()` call receives previously generated files
 * - Builds a smart context window containing only relevant dependency files
 * - System prompt includes project classification + tech stack
 * - Token budget management (~4000 tokens for dependency context)
 * 
 * @author Dieudonné MATANDA (ALTER EGO) — AENEWS UNIVERSEL
 * @version 2.0.0-context-aware
 */

import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { config } from '../config/env.js';
import { logger } from '../config/logger.js';
import type { FileSpec } from '../services/orchestrator.service.js';
import { MODEL_REGISTRY, AIProvider, MODEL_ROTATION_POOLS } from '../services/ai-failover.js';

// ============================================
// 🔹 TYPES
// ============================================

/** Shape of the context object passed to generateFile() */
export interface GenerationContext {
  /** Project classification from the orchestrator */
  classification?: any;
  /** All files generated so far (path → content) */
  generatedFiles: Record<string, string>;
  /** Recommended tech stack from classification */
  techStack?: string[];
}

/** Estimated token count for a string (rough: 1 token ≈ 4 chars) */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

// ============================================
// 🔹 AI CLIENTS
// ============================================

const openai = new OpenAI({ apiKey: config.openai.apiKey });
const anthropic = new Anthropic({ apiKey: config.anthropic.apiKey });

// DashScope client (OpenAI-compatible with custom baseURL)
let dashscope: OpenAI | null = null;
if (config.dashscope.enabled && config.dashscope.apiKey) {
  dashscope = new OpenAI({
    apiKey: config.dashscope.apiKey,
    baseURL: config.dashscope.baseUrl,
  });
  logger.info(`[Generator] DashScope enabled: ${config.dashscope.baseUrl}`);
}

// Round-robin model rotation counter
let rotationCounters: Record<string, number> = {
  'qwen-turbo': 0, 'qwen-plus': 0, 'qwen-max': 0,
  'qwen3-235b-a22b': 0, 'qwen3-30b-a3b': 0,
  'qwen3-coder-480b': 0, 'qwen3-coder-plus': 0, 'qwen3-coder-flash': 0,
  'qwen3.6-plus': 0, 'qwen3.6-flash': 0,
  'qwen3-32b': 0, 'qwen3.5-35b': 0, 'qwen3.5-plus': 0, 'qwen3-max': 0,
  'qwen-vl-max': 0, 'qwen-coder-plus': 0,
};

/**
 * Pick next DashScope model in the same tier (round-robin rotation)
 * Falls back to OpenAI/Anthropic if DashScope is unavailable
 */
function rotateModel(model: string): string {
  const registry = MODEL_REGISTRY[model];
  if (!registry) return model;

  if (registry.provider === AIProvider.DASHSCOPE && dashscope) {
    const pool = MODEL_ROTATION_POOLS[registry.tier] || [];
    const dsModels = pool.filter(m => MODEL_REGISTRY[m]?.provider === AIProvider.DASHSCOPE);
    if (dsModels.length > 1) {
      const idx = (rotationCounters[model] || 0) % dsModels.length;
      rotationCounters[model] = idx + 1;
      const rotated = dsModels[idx];
      logger.debug(`[Generator] Rotating ${model} → ${rotated}`);
      return rotated;
    }
  }
  return model;
}

export class Generator {
  /** Max tokens for the dependency context window (keep prompt focused) */
  private readonly CONTEXT_TOKEN_BUDGET = 24000;

  /**
   * Generate a single file with full context awareness.
   * 
   * @param fileSpec  - The file specification from the plan
   * @param model     - Which LLM to use for generation
   * @param context   - Previously generated files + project metadata
   * @returns The generated file content (raw code, no markdown fences)
   */
  async generateFile(
    fileSpec: FileSpec,
    model: string,
    context: GenerationContext
  ): Promise<string> {
    // Apply model rotation (round-robin within same tier)
    const activeModel = rotateModel(model);

    logger.info(
      { file: fileSpec.path, model: activeModel, original: model, deps: fileSpec.dependencies.length },
      '🔨 Generating file (context-aware + rotation)'
    );

    const prompt = this.buildPrompt(fileSpec, context);
    const systemPrompt = this.buildSystemPrompt(context);

    try {
      let rawContent: string;
      const registry = MODEL_REGISTRY[activeModel];
      const provider = registry?.provider;

      if (provider === AIProvider.DASHSCOPE && dashscope) {
        rawContent = await this.generateWithDashScope(systemPrompt, prompt, activeModel);
      } else if (provider === AIProvider.OPENAI || activeModel.startsWith('gpt')) {
        rawContent = await this.generateWithOpenAI(systemPrompt, prompt, activeModel);
      } else if (provider === AIProvider.CLAUDE || activeModel.startsWith('claude')) {
        rawContent = await this.generateWithAnthropic(systemPrompt, prompt, activeModel);
      } else {
        // Unknown model — try DashScope first, then OpenAI fallback
        if (dashscope) {
          try {
            rawContent = await this.generateWithDashScope(systemPrompt, prompt, activeModel);
          } catch {
            rawContent = await this.generateWithOpenAI(systemPrompt, prompt, 'gpt-4o');
          }
        } else {
          rawContent = await this.generateWithOpenAI(systemPrompt, prompt, 'gpt-4o');
        }
      }

      // Strip markdown code fences if the LLM wrapped the output
      return this.extractCode(rawContent);
    } catch (error) {
      logger.error({ error, file: fileSpec.path }, '❌ Generation failed');
      throw error;
    }
  }

  // ============================================
  // 🧠 PROMPT BUILDING
  // ============================================

  /**
   * Build the system prompt with project-level context.
   * Includes classification, tech stack, and general coding guidelines.
   */
  private buildSystemPrompt(context: GenerationContext): string {
    const parts: string[] = [
      'You are a WORLD-CLASS senior software engineer with 15+ years of experience.',
      'You generate PRODUCTION-READY, PREMIUM code that is:',
      '  - Clean, well-typed, and follows modern best practices',
      '  - Properly structured with clear separation of concerns',
      '  - Responsive and accessible (mobile-first design)',
      '  - Performant with optimized rendering and data fetching',
      '  - Secure with proper input validation and error handling',
    ];

    // Add project classification context
    if (context.classification) {
      const cls = context.classification;
      parts.push(
        '\n## Project Context',
        `- Project type: ${cls.type || 'unknown'}`,
        `- Complexity: ${cls.complexity || 'medium'}`,
        `- Features: ${(cls.features || []).join(', ')}`,
        `- Estimated files: ${cls.estimatedFiles || 'N/A'}`
      );
    }

    // Add tech stack context
    if (context.techStack && context.techStack.length > 0) {
      parts.push(
        '\n## Tech Stack',
        `Use these technologies: ${context.techStack.join(', ')}`,
        'Follow the idiomatic patterns and conventions of each technology.'
      );
    }

    parts.push(
      '\n## Code Quality Standards',
      '- Use TypeScript with STRICT types (never use `any` unless absolutely unavoidable)',
      '- Use proper async/await with try/catch for all async operations',
      '- Add JSDoc comments for exported functions and complex logic',
      '- Use ES2024+ syntax (optional chaining, nullish coalescing, etc.)',
      '- Follow the single responsibility principle — one export per file',
      '- Use meaningful variable and function names (no abbreviations)',
      '- Handle edge cases and validate all external inputs',
      '- Use CSS-in-JS or Tailwind CSS for styling (no separate .css files unless necessary)',
      '- Ensure responsive design with mobile-first approach',
      '- Add proper loading, error, and empty states for UI components',
      '- Use named exports; default export only for page-level components',
      '\n## Output',
      '- Return ONLY the file content. No explanations, no markdown headers.',
      '- Do NOT wrap in ```code blocks.',
      '- Ensure the code is complete and ready to run.'
    );

    return parts.join('\n');
  }

  /**
   * Build the user prompt with file spec + smart dependency context.
   * 
   * Selects only the most relevant previously generated files based on
   * the current fileSpec's dependency list, respecting the token budget.
   */
  private buildPrompt(fileSpec: FileSpec, context: GenerationContext): string {
    const parts: string[] = [];

    // ── File specification ─────────────────────────────────────────
    parts.push(
      `## Generate File: ${fileSpec.path}`,
      '',
      `**Description:** ${fileSpec.description}`,
      `**Type:** ${fileSpec.type}`,
      `**Priority:** ${fileSpec.priority}`,
    );

    if (fileSpec.dependencies.length > 0) {
      parts.push(`**Dependencies:** ${fileSpec.dependencies.join(', ')}`);
    }

    // ── Smart dependency context ───────────────────────────────────
    const depContext = this.buildDependencyContext(fileSpec, context.generatedFiles);
    if (depContext) {
      parts.push(
        '',
        '## Context: Related Files',
        'The following files have already been generated. Use them for import paths,',
        'type references, and to ensure consistency.',
        '',
        depContext
      );
    }

    // ── Generation instructions ────────────────────────────────────
    parts.push(
      '',
      '## Instructions',
      '- Generate ONLY the content for the file specified above.',
      '- Import from dependency files using relative paths matching the project structure.',
      '- Ensure all TypeScript types are properly referenced.',
      '- Use the exact export names from dependency files.'
    );

    return parts.join('\n');
  }

  /**
   * Select and format the most relevant previously-generated files
   * to include as context. Respects the CONTEXT_TOKEN_BUDGET to avoid
   * blowing up the prompt.
   * 
   * Priority order:
   * 1. Files explicitly listed in fileSpec.dependencies
   * 2. Files whose path suggests they are closely related (same directory, shared types)
   */
  private buildDependencyContext(
    fileSpec: FileSpec,
    generatedFiles: Record<string, string>
  ): string {
    if (!generatedFiles || Object.keys(generatedFiles).length === 0) {
      return '';
    }

    const contextParts: string[] = [];
    let usedTokens = 0;

    // ── Phase 1: Explicit dependencies (highest priority) ──────────
    for (const depPath of fileSpec.dependencies) {
      // Try exact match or fuzzy match
      let matchedPath: string | undefined = depPath;
      if (!generatedFiles[depPath]) {
        // Fuzzy match: find the file that best matches the dependency name
        matchedPath = Object.keys(generatedFiles).find(
          (p) =>
            p.endsWith(depPath) ||
            p.endsWith(`/${depPath}`) ||
            p.includes(depPath)
        );
      }

      if (matchedPath && generatedFiles[matchedPath]) {
        const content = generatedFiles[matchedPath];
        const tokens = estimateTokens(content);

        if (usedTokens + tokens <= this.CONTEXT_TOKEN_BUDGET) {
          contextParts.push(`--- ${matchedPath} ---\n${content}`);
          usedTokens += tokens;
        } else {
          // Budget exhausted — stop adding context
          break;
        }
      }
    }

    // ── Phase 2: Related files from same directory (if budget remains) ─
    if (usedTokens < this.CONTEXT_TOKEN_BUDGET) {
      const currentDir = fileSpec.path.includes('/')
        ? fileSpec.path.substring(0, fileSpec.path.lastIndexOf('/'))
        : '';

      // Shared types/config files are universally useful
      const universalPatterns = [
        'types.ts', 'types/index.ts', 'types.d.ts',
        'config.ts', 'constants.ts', 'utils.ts', 'helpers.ts',
        'package.json', 'tsconfig.json',
      ];

      const candidates = Object.keys(generatedFiles).filter((path) => {
        // Skip files already included as explicit deps
        if (contextParts.some((p) => p.startsWith(`--- ${path} ---`))) {
          return false;
        }
        // Match files in same directory
        if (currentDir && path.startsWith(currentDir)) {
          return true;
        }
        // Match universal patterns
        return universalPatterns.some((pattern) => path.endsWith(pattern));
      });

      for (const path of candidates) {
        const content = generatedFiles[path];
        const tokens = estimateTokens(content);

        if (usedTokens + tokens <= this.CONTEXT_TOKEN_BUDGET) {
          contextParts.push(`--- ${path} ---\n${content}`);
          usedTokens += tokens;
        } else {
          break;
        }
      }
    }

    if (contextParts.length === 0) {
      return '';
    }

    // Add token usage header for debugging
    const header = `<!-- Context: ${contextParts.length} file(s), ~${usedTokens} tokens -->`;
    return header + '\n' + contextParts.join('\n\n');
  }

  // ============================================
  // 🤖 AI GENERATION
  // ============================================

  /**
   * Generate using OpenAI (GPT-4o or GPT-4o-mini)
   */
  private async generateWithOpenAI(
    systemPrompt: string,
    userPrompt: string,
    model: string
  ): Promise<string> {
    if (!openai) throw new Error('OpenAI not configured');
    const response = await openai.chat.completions.create({
      model: model === 'gpt-4o-mini' ? 'gpt-4o-mini' : 'gpt-4o',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.2,
      max_tokens: config.cost.maxTokensPerRequest,
    });

    return response.choices[0].message.content || '';
  }

  /**
   * Generate using Anthropic (Claude Sonnet or Claude Opus)
   */
  private async generateWithAnthropic(
    systemPrompt: string,
    userPrompt: string,
    model: string
  ): Promise<string> {
    if (!anthropic) throw new Error('Anthropic not configured');
    const anthropicModel =
      model === 'claude-opus'
        ? 'claude-3-opus-20240229'
        : 'claude-3-5-sonnet-20241022';

    const response = await anthropic.messages.create({
      model: anthropicModel,
      max_tokens: config.cost.maxTokensPerRequest,
      temperature: 0.2,
      system: systemPrompt,
      messages: [
        { role: 'user', content: userPrompt },
      ],
    });

    const content = response.content[0];
    if (content.type !== 'text') {
      throw new Error('Unexpected Anthropic response type');
    }

    return content.text;
  }

  // ============================================
  // 🔧 UTILITIES
  // ============================================

  /**
   * Generate using DashScope (Qwen models via OpenAI-compatible API)
   */
  private async generateWithDashScope(
    systemPrompt: string,
    userPrompt: string,
    model: string
  ): Promise<string> {
    if (!dashscope) {
      throw new Error('DashScope client not initialized');
    }

    // CRITICAL FIX: Resolve registry key to actual DashScope model name
    // e.g. 'qwen3-coder-480b' -> 'qwen3-coder-480b-a35b-instruct'
    const registry = MODEL_REGISTRY[model];
    const actualModel = registry?.name || model;

    // Cap max_tokens to the model's own limit from registry, never exceed it
    const modelMaxTokens = registry?.maxTokens || 8192;
    const maxTokens = Math.min(config.cost.maxTokensPerRequest, modelMaxTokens);

    const response = await dashscope.chat.completions.create({
      model: actualModel,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.2,
      max_tokens: maxTokens,
    });

    return response.choices[0]?.message?.content || '';
  }

  /**
   * Extract code from markdown code blocks if present.
   * LLMs sometimes wrap output in ```tsx ... ``` fences.
   */
  extractCode(content: string): string {
    // If the entire response is one code block, extract just the content
    const codeBlockRegex = /```(?:\w+)?\n([\s\S]*?)```/g;
    const matches = [...content.matchAll(codeBlockRegex)];

    if (matches.length === 1) {
      // Single code block — extract the content
      return matches[0][1].trim();
    }

    if (matches.length > 1) {
      // Multiple code blocks — take the first one (most likely the main file)
      return matches[0][1].trim();
    }

    // No code block found — return as-is
    return content.trim();
  }
}
