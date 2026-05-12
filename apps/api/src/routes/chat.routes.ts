/**
 * Chat Routes - Real AI Chat using AIFailoverEngine
 */

import type { FastifyInstance } from 'fastify';
import { AIFailoverEngine } from '../services/ai-failover.js';
import type { AIRequest } from '../services/ai-failover.js';
import { logger } from '../config/logger.js';

const SYSTEM_PROMPT = `You are AENEWS, a senior full-stack AI development assistant integrated into the AENEWS STUDIO platform. You are professional, precise, and action-oriented.

CORE IDENTITY:
- Expert software engineer with deep knowledge of: React, Next.js, TypeScript, Node.js, Python, PostgreSQL, Redis, Docker, TailwindCSS, Prisma, REST APIs, GraphQL, CI/CD, cloud deployment.
- Write clean, production-ready code with proper error handling, TypeScript types, and best practices.
- Explain complex concepts clearly and concisely.
- When asked to build something, provide complete, working code - not just snippets.
- Powered by Alibaba Cloud Qwen models.

RULES:
1. Always respond in the same language the user uses (French, English, etc.)
2. Be direct and professional. No unnecessary filler or excessive emojis.
3. When providing code, always specify the file path and language.
4. Format code in proper markdown code blocks with language tags.
5. If you don't know something, say so honestly.
6. For complex tasks, break them into clear steps.
7. When the user wants to create a full project, suggest using the "New Project" tab.
8. Keep responses focused and technical. Avoid generic platitudes.`;

// Singleton instance
let aiEngine: AIFailoverEngine | null = null;
function getAIEngine(): AIFailoverEngine {
  if (!aiEngine) {
    aiEngine = new AIFailoverEngine();
  }
  return aiEngine;
}

export async function chatRoutes(app: FastifyInstance) {

  // POST /api/chat - Send message, get AI response
  app.post('/', {
    onRequest: [(app as any).authenticate],
  }, async (request, reply) => {
    try {
      const body = request.body as any;
      const { message, history } = body;
      const user = request.user as any;

      if (!message || typeof message !== 'string' || message.trim().length === 0) {
        return reply.status(400).send({
          success: false,
          error: 'Message is required',
        });
      }

      if (message.length > 4000) {
        return reply.status(400).send({
          success: false,
          error: 'Message too long (max 4000 chars)',
        });
      }

      logger.info({ userId: user.id, msgLen: message.length }, '[Chat] Request');

      // Build messages array
      const messages: AIRequest['messages'] = [
        { role: 'system', content: SYSTEM_PROMPT },
      ];

      // Add conversation history (last 10 messages for context)
      if (Array.isArray(history) && history.length > 0) {
        const recentHistory = history.slice(-10);
        for (const msg of recentHistory) {
          if (msg.role === 'user' || msg.role === 'assistant') {
            messages.push({ role: msg.role, content: msg.content });
          }
        }
      }

      messages.push({ role: 'user', content: message.trim() });

      // Call AI with failover
      const engine = getAIEngine();
      const response = await engine.execute({
        messages,
        temperature: 0.7,
        maxTokens: 4000,
      });

      logger.info({
        userId: user.id,
        provider: response.provider,
        model: response.model,
        latency: response.latency,
        cost: response.usage.cost,
      }, '[Chat] Response sent');

      return reply.send({
        success: true,
        content: response.content,
        provider: response.provider,
        model: response.model,
        usage: {
          inputTokens: response.usage.inputTokens,
          outputTokens: response.usage.outputTokens,
        },
      });

    } catch (error: any) {
      logger.error({ error: error.message }, '[Chat] Request failed');
      return reply.status(500).send({
        success: false,
        error: error.message || 'AI service temporarily unavailable. Please try again.',
      });
    }
  });
}

