/**
 * Unified AI Routes — Streaming + Non-streaming + Model Registry
 * 
 * All AI operations go through the UnifiedAIClient:
 * - POST /api/ai/chat          — Non-streaming chat completion
 * - POST /api/ai/chat/stream   — Streaming chat completion (SSE)
 * - GET  /api/ai/models        — Available models + circuit status + costs
 */

import type { FastifyInstance } from 'fastify';
import { getUnifiedAIClient, type CompletionOptions } from '../services/unified-ai-client.js';
import { logger } from '../config/logger.js';

export async function aiRoutes(fastify: FastifyInstance) {
  // Chat completion (non-streaming)
  fastify.post('/chat', {
    preHandler: [(fastify as any).authenticate],
  }, async (request, reply) => {
    const { messages, model, temperature, maxTokens } = request.body as any;

    if (!messages || !Array.isArray(messages)) {
      return reply.status(400).send({ error: 'messages array is required' });
    }

    try {
      const client = getUnifiedAIClient();
      const result = await client.complete({
        messages,
        model,
        temperature,
        maxTokens,
      });

      return result;
    } catch (error: any) {
      logger.error({ error: error.message }, '[AI] Chat completion failed');
      return reply.status(500).send({ error: error.message || 'AI completion failed' });
    }
  });

  // Chat completion with STREAMING (SSE)
  fastify.post('/chat/stream', {
    preHandler: [(fastify as any).authenticate],
  }, async (request, reply) => {
    const { messages, model, temperature, maxTokens } = request.body as any;

    if (!messages || !Array.isArray(messages)) {
      return reply.status(400).send({ error: 'messages array is required' });
    }

    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    });

    const client = getUnifiedAIClient();

    try {
      for await (const chunk of client.stream({ messages, model, temperature, maxTokens })) {
        const data = JSON.stringify(chunk);
        reply.raw.write(`data: ${data}\n\n`);
      }
      reply.raw.write('data: [DONE]\n\n');
    } catch (error: any) {
      logger.error({ error: error.message }, '[AI] Stream failed');
      const errorData = JSON.stringify({ error: error.message });
      reply.raw.write(`event: error\ndata: ${errorData}\n\n`);
    }

    reply.raw.end();
  });

  // Get available models, circuit status, cost status
  fastify.get('/models', {
    preHandler: [(fastify as any).authenticate],
  }, async (request, reply) => {
    const client = getUnifiedAIClient();
    return {
      providers: client.getAvailableProviders(),
      circuits: client.getCircuitStatus(),
      costs: client.getCostStatus(),
    };
  });
}
