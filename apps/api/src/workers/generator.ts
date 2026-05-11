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

export class Generator {
  /** Max tokens for the dependency context window (keep prompt focused) */
  private readonly CONTEXT_TOKEN_BUDGET = 4000;

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
    model: 'gpt-4o' | 'gpt-4o-mini' | 'claude-sonnet' | 'claude-opus',
    context: GenerationContext
  ): Promise<string> {
    logger.info(
      { file: fileSpec.path, model, deps: fileSpec.dependencies.length },
      '🔨 Generating file (context-aware)'
    );

    const prompt = this.buildPrompt(fileSpec, context);
    const systemPrompt = this.buildSystemPrompt(context);

    try {
      let rawContent: string;

      if (model.startsWith('gpt')) {
        rawContent = await this.generateWithOpenAI(systemPrompt, prompt, model);
      } else {
        rawContent = await this.generateWithAnthropic(systemPrompt, prompt, model);
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
      'You are an expert software engineer working on the AENEWS BUILDER platform.',
      'You generate production-ready code that is clean, well-typed, and follows modern best practices.',
    ];

    // Add project classification context
    if (context.classification) {
      const cls = context.classification;
      parts.push(
        `\n## Project Context`,
        `- Project type: ${cls.type || 'unknown'}`,
        `- Complexity: ${cls.complexity || 'medium'}`,
        `- Features: ${(cls.features || []).join(', ')}`,
        `- Estimated files: ${cls.estimatedFiles || 'N/A'}`
      );
    }

    // Add tech stack context
    if (context.techStack && context.techStack.length > 0) {
      parts.push(
        `\n## Tech Stack`,
        `Use these technologies: ${context.techStack.join(', ')}`,
        'Match the coding style and conventions of these technologies.'
      );
    }

    parts.push(
      '\n## Rules',
      '- Return ONLY the file content. No explanations, no markdown headers.',
      '- Use TypeScript with proper types (no `any` unless absolutely necessary).',
      '- Include proper error handling for async operations.',
      '- Add brief comments for complex logic only.',
      '- Export components/functions as named exports unless a default export is idiomatic.'
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
