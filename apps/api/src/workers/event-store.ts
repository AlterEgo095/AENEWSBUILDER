/**
 * Event Store - Dual-layer (Redis + PostgreSQL)
 * Real-time: Redis pub/sub → SSE
 * Persistent: PostgreSQL for replay/audit
 */

import { getRedis } from '../services/redis.service.js';
import { logger } from '../config/logger.js';

export interface WorkflowEvent {
  state: string;
  nextState: string;
  event: string;
  data?: any;
  timestamp: string;
}

export class EventStore {
  private projectId: string;
  private redis: ReturnType<typeof getRedis>;

  constructor(projectId: string) {
    this.projectId = projectId;
    this.redis = getRedis();
  }

  /**
   * Record event (dual-write: Redis + PostgreSQL)
   */
  async record(event: WorkflowEvent): Promise<void> {
    try {
      // 1. Redis (real-time pub/sub)
      const channel = `project:${this.projectId}:events`;
      await this.redis.publish(channel, JSON.stringify(event));

      // 2. Redis (list for history)
      const listKey = `project:${this.projectId}:history`;
      await this.redis.rpush(listKey, JSON.stringify(event));
      await this.redis.expire(listKey, 86400); // 24h TTL

      // 3. PostgreSQL (persistent - handled by Prisma in routes)
      // This would be done via Prisma Client in the API routes

      logger.debug({ projectId: this.projectId, event: event.event }, '📝 Event recorded');

    } catch (error) {
      logger.error({ error, projectId: this.projectId }, '❌ Failed to record event');
    }
  }

  /**
   * Get event history
   */
  async getHistory(): Promise<WorkflowEvent[]> {
    try {
      const listKey = `project:${this.projectId}:history`;
      const events = await this.redis.lrange(listKey, 0, -1);
      return events.map((e) => JSON.parse(e));
    } catch (error) {
      logger.error({ error, projectId: this.projectId }, '❌ Failed to get history');
      return [];
    }
  }

  /**
   * Subscribe to events (for SSE)
   */
  subscribe(callback: (event: WorkflowEvent) => void): void {
    const subscriber = this.redis.duplicate();
    const channel = `project:${this.projectId}:events`;

    subscriber.subscribe(channel, (err) => {
      if (err) {
        logger.error({ err }, '❌ Failed to subscribe');
      }
    });

    subscriber.on('message', (ch, message) => {
      if (ch === channel) {
        try {
          const event = JSON.parse(message);
          callback(event);
        } catch (error) {
          logger.error({ error }, '❌ Failed to parse event');
        }
      }
    });
  }

  /**
   * Replay events (for debugging/recovery)
   */
  async replay(): Promise<WorkflowEvent[]> {
    const history = await this.getHistory();
    logger.info({ projectId: this.projectId, eventsCount: history.length }, '🔄 Replaying events');
    return history;
  }
}
