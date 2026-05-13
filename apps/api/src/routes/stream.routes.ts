/**
 * SSE Stream Routes - Real-time Event Streaming
 * 
 * Architecture:
 * - V1 (EventStore): Redis pub/sub for low-latency real-time SSE streaming
 * - V2 (eventStoreV2): PostgreSQL + Redis Streams for durable event history
 * 
 * On SSE connect, V2 is queried first to replay any persisted events the client
 * may have missed (e.g. after a reconnect), then V1 takes over for live streaming.
 */

import type { FastifyInstance } from 'fastify';
import { EventStore } from '../workers/event-store.js';
import { eventStoreV2 } from '../workers/event-store-v2.js';

export async function streamRoutes(app: FastifyInstance) {
  // ─────────────────────────────────────────────────────────────
  // GET /api/stream/history/:projectId — Persisted event history (V2)
  // ─────────────────────────────────────────────────────────────
  app.get('/history/:projectId', {
    onRequest: [(app as any).authenticate],
  }, async (request, reply) => {
    const { projectId } = request.params as { projectId: string };

    try {
      const events = await eventStoreV2.getEvents({ projectId });

      return reply.send({
        success: true,
        projectId,
        count: events.length,
        events,
      });
    } catch (error: any) {
      app.log.error({ error: error.message, projectId }, 'Failed to fetch event history');
      return reply.status(500).send({
        success: false,
        error: 'Failed to fetch event history',
      });
    }
  });

  // ─────────────────────────────────────────────────────────────
  // GET /api/stream/:projectId — Real-time SSE (V1 + V2 catch-up)
  // ─────────────────────────────────────────────────────────────
  app.get('/:projectId', {
    onRequest: [(app as any).authenticate],
  }, async (request, reply) => {
    const { projectId } = request.params as { projectId: string };

    // Set SSE headers
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    });

    // ── Phase 1: V2 catch-up ────────────────────────────────────
    // Replay recent persisted events so the client gets anything
    // that V1 may have missed (e.g. during a disconnect).
    try {
      const recentEvents = await eventStoreV2.getEvents({
        projectId,
        limit: 50,
      });

      if (recentEvents.length > 0) {
        // Send as a batched "history" event so the client can
        // distinguish catch-up from live events.
        reply.raw.write(
          `event: history\ndata: ${JSON.stringify({ projectId, count: recentEvents.length, events: recentEvents })}\n\n`
        );
      }
    } catch (catchUpError: any) {
      // Catch-up failure is non-fatal; live streaming still works
      app.log.warn(
        { error: catchUpError.message, projectId },
        'V2 catch-up failed, continuing with live SSE'
      );
    }

    // ── Phase 2: V1 live streaming ──────────────────────────────
    const eventStore = new EventStore(projectId);

    // Send initial connection event
    reply.raw.write(`data: ${JSON.stringify({ type: 'connected', projectId })}\n\n`);

    // Subscribe to events via V1 Redis pub/sub
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
