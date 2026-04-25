/**
 * SSE Stream Routes - Real-time Event Streaming
 */

import type { FastifyInstance } from 'fastify';
import { EventStore } from '../workers/event-store.js';

export async function streamRoutes(app: FastifyInstance) {
  // SSE endpoint for project events
  app.get('/:projectId', {
    onRequest: [app.authenticate],
  }, async (request, reply) => {
    const { projectId } = request.params as { projectId: string };

    // Set SSE headers
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    });

    const eventStore = new EventStore(projectId);

    // Send initial connection event
    reply.raw.write(`data: ${JSON.stringify({ type: 'connected', projectId })}\n\n`);

    // Subscribe to events
    eventStore.subscribe((event) => {
      reply.raw.write(`data: ${JSON.stringify(event)}\n\n`);
    });

    // Keep connection alive
    const keepAlive = setInterval(() => {
      reply.raw.write(': keepalive\n\n');
    }, 30000);

    // Cleanup on close
    request.raw.on('close', () => {
      clearInterval(keepAlive);
      reply.raw.end();
    });
  });
}
