/**
 * Generator - Incremental File Generation with Context
 */

import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { config } from '../config/env.js';
import { logger } from '../config/logger.js';
import type { FileSpec } from '../services/orchestrator.service.js';

const openai = new OpenAI({ apiKey: config.openai.apiKey });
const anthropic = new Anthropic({ apiKey: config.anthropic.apiKey });

export class Generator {
  /**
   * Generate single file with context awareness
   */
  async generateFile(
    fileSpec: FileSpec,
    model: 'gpt-4o' | 'gpt-4o-mini' | 'claude-sonnet' | 'claude-opus'
  ): Promise<string> {
    logger.info({ file: fileSpec.path, model }, '🔨 Generating file');

    const prompt = this.buildPrompt(fileSpec);

    try {
      if (model.startsWith('gpt')) {
        return await this.generateWithOpenAI(prompt, model);
      } else {
        return await this.generateWithAnthropic(prompt, model);
      }
    } catch (error) {
      logger.error({ error, file: fileSpec.path }, '❌ Generation failed');
      throw error;
    }
  }

  /**
   * Build context-aware prompt
   */
  private buildPrompt(fileSpec: FileSpec): string {
    return `Generate the file: ${fileSpec.path}

Description: ${fileSpec.description}
Type: ${fileSpec.type}
Dependencies: ${fileSpec.dependencies.join(', ')}

Requirements:
- Production-ready code
- Proper error handling
- TypeScript types
- Comments for complex logic
- Follow best practices

Return ONLY the file content, no explanations.`;
  }

  /**
   * Generate using OpenAI
   */
  private async generateWithOpenAI(prompt: string, model: string): Promise<string> {
    const response = await openai.chat.completions.create({
      model: model === 'gpt-4o-mini' ? 'gpt-4o-mini' : 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: 'You are an expert software engineer. Generate production-ready code.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      temperature: 0.2,
      max_tokens: config.cost.maxTokensPerRequest,
    });

    return response.choices[0].message.content || '';
  }

  /**
   * Generate using Anthropic
   */
  private async generateWithAnthropic(prompt: string, model: string): Promise<string> {
    const anthropicModel =
      model === 'claude-opus'
        ? 'claude-3-opus-20240229'
        : 'claude-3-5-sonnet-20241022';

    const response = await anthropic.messages.create({
      model: anthropicModel,
      max_tokens: config.cost.maxTokensPerRequest,
      temperature: 0.2,
      system: 'You are an expert software engineer. Generate production-ready code.',
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
    });

    const content = response.content[0];
    if (content.type !== 'text') {
      throw new Error('Unexpected response type');
    }

    return content.text;
  }

  /**
   * Extract code from markdown code blocks if present
   */
  extractCode(content: string): string {
    const codeBlockRegex = /```(?:\w+)?\n([\s\S]*?)```/g;
    const matches = [...content.matchAll(codeBlockRegex)];
    
    if (matches.length > 0) {
      return matches[0][1].trim();
    }
    
    return content.trim();
  }
}
