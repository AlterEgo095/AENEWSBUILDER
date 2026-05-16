/**
 * Refinement Routes - Conversational Code Refinement
 * 
 * Enables post-generation iterative refinement through natural language.
 * The AI receives existing code + user's modification request and returns
 * only the modified files with explanations.
 * 
 * This is what makes AENEWS different from one-shot generators:
 * - User can say "change the button to blue" and see instant results
 * - AI understands the full project context
 * - Only modified files are updated (incremental refinement)
 * - Full conversation history is maintained for context
 * 
 * SSE events stream each file modification in real-time.
 */

import type { FastifyInstance } from 'fastify';
import { prisma } from '../config/prisma.js';
import { logger } from '../config/logger.js';
import { EventStore } from '../workers/event-store.js';
import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { config } from '../config/env.js';
import { resolveModelName, getModelSpecialParams } from '../services/ai-failover.js';

// AI Clients
const openai = new OpenAI({ apiKey: config.openai.apiKey });
const anthropic = new Anthropic({ apiKey: config.anthropic.apiKey });

let dashscope: OpenAI | null = null;
if (config.dashscope.enabled && config.dashscope.apiKey) {
  dashscope = new OpenAI({
    apiKey: config.dashscope.apiKey,
    baseURL: config.dashscope.baseUrl,
  });
}

interface RefinementMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

interface RefinementResult {
  success: boolean;
  modifiedFiles: Record<string, string>;
  explanation: string;
  filesModified: string[];
}

export async function refineRoutes(app: FastifyInstance) {

  // ─────────────────────────────────────────────────────────────
  // POST /api/refine/:projectId — Refine generated code via chat
  // ─────────────────────────────────────────────────────────────
  app.post('/:projectId', {
    onRequest: [(app as any).authenticate],
  }, async (request, reply) => {
    const { projectId } = request.params as { projectId: string };
    const body = request.body as {
      message: string;
      history?: RefinementMessage[];
    };
    const user = request.user as any;

    if (!body.message || typeof body.message !== 'string' || body.message.trim().length === 0) {
      return reply.status(400).send({ error: 'Message is required' });
    }

    if (body.message.length > 4000) {
      return reply.status(400).send({ error: 'Message too long (max 4000 chars)' });
    }

    try {
      // Load project from DB
      const project = await prisma.project.findUnique({
        where: { id: projectId },
        select: { id: true, name: true, state: true, context: true, prompt: true },
      });

      if (!project) {
        return reply.status(404).send({ error: 'Project not found' });
      }

      const context = project.context as any;
      const existingFiles: Record<string, string> = context?.files || {};
      const classification: any = context?.classification || {};

      if (Object.keys(existingFiles).length === 0) {
        return reply.status(400).send({ error: 'No files to refine. Generate a project first.' });
      }

      logger.info({ projectId, message: body.message.substring(0, 100) }, '[Refine] Starting refinement');

      // Build the refinement prompt with full project context
      const systemPrompt = buildRefinementSystemPrompt(existingFiles, classification, project.prompt);
      const messages = buildRefinementMessages(systemPrompt, body.message, body.history || [], existingFiles);

      // Call AI with DashScope priority
      const result = await executeRefinement(projectId, messages, existingFiles);

      if (!result.success) {
        return reply.status(500).send({ error: 'Refinement failed', details: result.explanation });
      }

      // Update project context with modified files
      const updatedFiles = { ...existingFiles, ...result.modifiedFiles };
      await prisma.project.update({
        where: { id: projectId },
        data: {
          context: {
            ...context,
            files: updatedFiles,
          },
          updatedAt: new Date(),
        },
      });

      // Publish SSE events for each modified file
      const eventStore = new EventStore(projectId);
      for (const filePath of result.filesModified) {
        await eventStore.record({
          state: 'REFINE',
          nextState: 'REFINE',
          event: 'file_refined',
          data: {
            filePath,
            explanation: result.explanation,
            totalModified: result.filesModified.length,
          },
          timestamp: new Date().toISOString(),
        });
      }

      logger.info({ projectId, filesModified: result.filesModified }, '[Refine] Refinement complete');

      return reply.send({
        success: true,
        modifiedFiles: result.modifiedFiles,
        explanation: result.explanation,
        filesModified: result.filesModified,
        totalFiles: Object.keys(updatedFiles).length,
      });

    } catch (error: any) {
      logger.error({ error: error.message, projectId }, '[Refine] Failed');
      return reply.status(500).send({ error: error.message || 'Refinement failed' });
    }
  });

  // ─────────────────────────────────────────────────────────────
  // GET /api/refine/:projectId/history — Get refinement history
  // ─────────────────────────────────────────────────────────────
  app.get('/:projectId/history', {
    onRequest: [(app as any).authenticate],
  }, async (request, reply) => {
    const { projectId } = request.params as { projectId: string };

    try {
      const events = await prisma.event.findMany({
        where: { projectId, event: 'file_refined' },
        orderBy: { timestamp: 'desc' },
        take: 50,
      });

      return reply.send({ projectId, refinements: events });
    } catch (error: any) {
      return reply.status(500).send({ error: 'Failed to fetch history' });
    }
  });
}

// ─── Helper Functions ──────────────────────────────────────────

function buildRefinementSystemPrompt(
  files: Record<string, string>,
  classification: any,
  originalPrompt: string
): string {
  const fileList = Object.keys(files);
  const fileContents = Object.entries(files)
    .map(([path, content]) => `--- ${path} ---\n${content}`)
    .join('\n\n');

  return `You are a WORLD-CLASS senior software engineer performing code refinement.
You receive the FULL project codebase and a user's modification request.

ORIGINAL PROJECT REQUEST: ${originalPrompt}
PROJECT TYPE: ${classification?.type || 'webapp'}
COMPLEXITY: ${classification?.complexity || 'medium'}

CURRENT FILES (${fileList.length}):
${fileContents}

REFINEMENT RULES:
1. Analyze the user's request carefully
2. Modify ONLY the files that need changes
3. Return a JSON object with this EXACT format:
{
  "modifiedFiles": { "path/to/file": "full updated content", ... },
  "explanation": "Brief explanation of what was changed and why",
  "filesModified": ["path/to/file", ...]
}
4. Return COMPLETE file contents, not diffs or patches
5. Maintain consistency across files (imports, types, etc.)
6. Preserve all existing functionality unless explicitly asked to change it
7. Follow the same coding style and patterns as the existing code
8. If the request is unclear, make reasonable assumptions and explain them

Return ONLY the JSON object, no markdown, no code blocks.`;
}

function buildRefinementMessages(
  systemPrompt: string,
  userMessage: string,
  history: RefinementMessage[],
  files: Record<string, string>
): Array<{ role: string; content: string }> {
  const messages: Array<{ role: string; content: string }> = [
    { role: 'system', content: systemPrompt },
  ];

  // Add conversation history (last 6 messages for context)
  const recentHistory = history.slice(-6);
  for (const msg of recentHistory) {
    if (msg.role === 'user' || msg.role === 'assistant') {
      messages.push({ role: msg.role, content: msg.content });
    }
  }

  // Add the current user message
  messages.push({ role: 'user', content: userMessage });

  return messages;
}

async function executeRefinement(
  projectId: string,
  messages: Array<{ role: string; content: string }>,
  existingFiles: Record<string, string>
): Promise<RefinementResult> {
  let content: string = '';
  let usedModel = 'unknown';

  // Try DashScope first (best for code)
  if (dashscope) {
    try {
      const model = resolveModelName('qwen3-coder-480b');
      const specialParams = getModelSpecialParams('qwen3-coder-480b');
      const response = await dashscope.chat.completions.create({
        model,
        messages: messages as any,
        temperature: 0.2,
        max_tokens: 8000,
        ...specialParams,
      });
      content = response.choices[0]?.message?.content || '';
      usedModel = 'qwen3-coder-480b';
    } catch (dsError: any) {
      logger.warn({ error: dsError.message }, 'DashScope refinement failed, falling back');
    }
  }

  // Fallback to OpenAI
  if (!content && openai) {
    try {
      const response = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: messages as any,
        temperature: 0.2,
        max_tokens: 8000,
      });
      content = response.choices[0]?.message?.content || '';
      usedModel = 'gpt-4o';
    } catch (error: any) {
      logger.warn({ error: error.message }, 'OpenAI refinement failed');
    }
  }

  // Fallback to Anthropic
  if (!content && anthropic) {
    try {
      const sysMsg = messages.find(m => m.role === 'system')?.content || '';
      const nonSysMessages = messages.filter(m => m.role !== 'system');
      const response = await anthropic.messages.create({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 8000,
        temperature: 0.2,
        system: sysMsg,
        messages: nonSysMessages.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
      });
      const respContent = response.content[0];
      if (respContent.type === 'text') {
        content = respContent.text;
        usedModel = 'claude-3-5-sonnet';
      }
    } catch (error: any) {
      logger.warn({ error: error.message }, 'Anthropic refinement failed');
    }
  }

  if (!content) {
    return { success: false, modifiedFiles: {}, explanation: 'All AI providers failed', filesModified: [] };
  }

  // Parse the JSON response
  try {
    // Clean markdown fences if present
    let cleanContent = content.trim();
    if (cleanContent.startsWith('```')) {
      cleanContent = cleanContent.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
    }

    const parsed = JSON.parse(cleanContent);

    return {
      success: true,
      modifiedFiles: parsed.modifiedFiles || {},
      explanation: parsed.explanation || 'Files refined successfully',
      filesModified: parsed.filesModified || Object.keys(parsed.modifiedFiles || {}),
    };
  } catch (parseError: any) {
    logger.error({ error: parseError.message, content: content.substring(0, 200) }, '[Refine] Failed to parse AI response');
    return {
      success: false,
      modifiedFiles: {},
      explanation: `Failed to parse AI response: ${parseError.message}`,
      filesModified: [],
    };
  }
}

