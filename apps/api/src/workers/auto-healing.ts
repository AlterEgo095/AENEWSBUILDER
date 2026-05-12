/**
 * Auto-Healing - Intelligent Error Recovery
 * 3 retries + model escalation (mini → sonnet → opus)
 */

import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { config } from '../config/env.js';
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
  logger.info(`[AutoHealing] DashScope enabled: ${config.dashscope.baseUrl}`);
}

export interface FixResult {
  success: boolean;
  files: Record<string, string>;
  appliedFixes: string[];
}

export class AutoHealing {
  /**
   * Attempt to fix errors with model escalation
   */
  async fix(
    files: Record<string, string>,
    errors: string[],
    retryCount: number
  ): Promise<FixResult> {
    logger.info({ retryCount, errorCount: errors.length }, '🔧 Attempting auto-healing');

    if (retryCount >= config.worker.autoHealingMaxRetries) {
      logger.error('❌ Max retries reached');
      return {
        success: false,
        files,
        appliedFixes: [],
      };
    }

    try {
      // Escalate model based on retry count
      const { model: selectedModel, provider: selectedProvider } = this.selectModel(retryCount);
      logger.info({ model: selectedModel, provider: selectedProvider }, '🎯 Using model for healing');

      // Analyze errors and generate fixes
      const fixes = await this.generateFixes(files, errors, selectedModel, selectedProvider);

      // Apply fixes
      const fixedFiles = this.applyFixes(files, fixes);

      return {
        success: true,
        files: fixedFiles,
        appliedFixes: fixes.map((f) => f.description),
      };

    } catch (error) {
      logger.error({ error }, '❌ Auto-healing failed');
      return {
        success: false,
        files,
        appliedFixes: [],
      };
    }
  }

  /**
   * Select model based on retry count (escalation with DashScope priority)
   * Retry 0: qwen-turbo (fast, cheap) → Retry 1: qwen-plus (standard) → Retry 2: qwen-max (advanced)
   */
  private selectModel(retryCount: number): { model: string; provider: 'dashscope' | 'openai' | 'anthropic' } {
    if (dashscope) {
      // DashScope-first escalation
      if (retryCount === 0) return { model: 'qwen-turbo', provider: 'dashscope' };
      if (retryCount === 1) return { model: 'qwen-plus', provider: 'dashscope' };
      if (retryCount === 2) return { model: 'qwen-max', provider: 'dashscope' };
      // Fallback to OpenAI/Anthropic for higher retries
      if (retryCount === 3) return { model: 'gpt-4o', provider: 'openai' };
      return { model: 'claude-opus', provider: 'anthropic' };
    }
    // Legacy escalation without DashScope
    if (retryCount === 0) return { model: 'gpt-4o-mini', provider: 'openai' };
    if (retryCount === 1) return { model: 'claude-3-5-sonnet-20241022', provider: 'anthropic' };
    return { model: 'claude-3-opus-20240229', provider: 'anthropic' };
  }

  /**
   * Generate fixes using AI (supports DashScope, OpenAI, Anthropic)
   */
  private async generateFixes(
    files: Record<string, string>,
    errors: string[],
    model: string,
    provider: 'dashscope' | 'openai' | 'anthropic'
  ): Promise<Array<{ file: string; fix: string; description: string }>> {
    const prompt = `Analyze these errors and suggest fixes:

Errors:
${errors.join('\n')}

Files:
${Object.entries(files)
  .map(([path, content]) => `--- ${path} ---\n${content}`)
  .join('\n\n')}

Return a JSON array of fixes with format:
[
  {
    "file": "path/to/file",
    "fix": "corrected file content",
    "description": "what was fixed"
  }
]

Return ONLY valid JSON.`;

    let response: string;

    if (provider === 'dashscope' && dashscope) {
      const completion = await dashscope.chat.completions.create({
        model: model,
        messages: [
          {
            role: 'system',
            content: 'You are an expert debugger. Analyze errors and provide precise fixes.',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        temperature: 0.1,
        max_tokens: 4000,
        response_format: { type: 'json_object' },
      });
      response = completion.choices[0]?.message?.content || '{}';
    } else if (provider === 'openai') {
      const completion = await openai.chat.completions.create({
        model: model === 'gpt-4o' ? 'gpt-4o' : 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: 'You are an expert debugger. Analyze errors and provide precise fixes.',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        temperature: 0.1,
        max_tokens: 4000,
        response_format: { type: 'json_object' },
      });
      response = completion.choices[0].message.content || '{}';
    } else {
      const anthropicModel =
        model === 'claude-opus'
          ? 'claude-3-opus-20240229'
          : 'claude-3-5-sonnet-20241022';

      const completion = await anthropic.messages.create({
        model: anthropicModel,
        max_tokens: 4000,
        temperature: 0.1,
        system: 'You are an expert debugger. Analyze errors and provide precise fixes.',
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
      });

      const content = completion.content[0];
      if (content.type !== 'text') {
        throw new Error('Unexpected response type');
      }
      response = content.text;
    }

    try {
      const parsed = JSON.parse(response);
      return Array.isArray(parsed) ? parsed : parsed.fixes || [];
    } catch (error) {
      logger.error({ error, response }, '❌ Failed to parse fixes');
      return [];
    }
  }

  /**
   * Apply fixes to files
   */
  private applyFixes(
    files: Record<string, string>,
    fixes: Array<{ file: string; fix: string; description: string }>
  ): Record<string, string> {
    const fixedFiles = { ...files };

    for (const fix of fixes) {
      if (fix.file in fixedFiles) {
        fixedFiles[fix.file] = fix.fix;
        logger.info({ file: fix.file, description: fix.description }, '✅ Fix applied');
      }
    }

    return fixedFiles;
  }

  /**
   * Detect error patterns
   */
  detectErrorPatterns(errors: string[]): {
    syntaxErrors: number;
    runtimeErrors: number;
    importErrors: number;
  } {
    let syntaxErrors = 0;
    let runtimeErrors = 0;
    let importErrors = 0;

    for (const error of errors) {
      const lowerError = error.toLowerCase();
      if (lowerError.includes('syntax') || lowerError.includes('unexpected token')) {
        syntaxErrors++;
      } else if (lowerError.includes('cannot find module') || lowerError.includes('import')) {
        importErrors++;
      } else {
        runtimeErrors++;
      }
    }

    return { syntaxErrors, runtimeErrors, importErrors };
  }
}
