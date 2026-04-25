/**
 * Event Store V2 - Production-Grade Event Sourcing
 * Features: Redis Pub/Sub (real-time), PostgreSQL (persistence), Event Replay
 * @module workers/event-store-v2
 */

import { Redis } from 'ioredis';
import { PrismaClient } from '@prisma/client';
import { EventEmitter } from 'events';
import { logger } from '../config/logger.js';
import { env } from '../config/env.js';

export interface WorkflowEventV2 {
  type: string;
  projectId: string;
  userId: string;
  data: any;
  timestamp?: Date;
  metadata?: {
    correlationId?: string;
    causationId?: string;
    version?: number;
  };
}

export interface EventFilter {
  projectId?: string;
  userId?: string;
  types?: string[];
  from?: Date;
  to?: Date;
  limit?: number;
}

class EventStoreV2 {
  private redis: Redis;
  private pubRedis: Redis;
  private subRedis: Redis;
  private prisma: PrismaClient;
  private emitter: EventEmitter;

  private readonly STREAM_KEY = 'workflow:events:v2';
  private readonly CHANNEL_PREFIX = 'events:';
  private readonly MAX_STREAM_LENGTH = 100000;

  constructor() {
    // Main Redis connection
    this.redis = new Redis({
      host: env.REDIS_HOST,
      port: env.REDIS_PORT,
      password: env.REDIS_PASSWORD,
    });

    // Dedicated pub/sub connections
    this.pubRedis = new Redis({
      host: env.REDIS_HOST,
      port: env.REDIS_PORT,
      password: env.REDIS_PASSWORD,
    });

    this.subRedis = new Redis({
      host: env.REDIS_HOST,
      port: env.REDIS_PORT,
      password: env.REDIS_PASSWORD,
    });

    this.prisma = new PrismaClient();
    this.emitter = new EventEmitter();
    this.emitter.setMaxListeners(100);

    this.setupSubscriptions();
  }

  /**
   * Setup Redis pub/sub subscriptions
   */
  private setupSubscriptions() {
    this.subRedis.psubscribe(`${this.CHANNEL_PREFIX}*`, (err, count) => {
      if (err) {
        logger.error('Redis subscription error', { error: err.message });
        return;
      }
      logger.info(`✅ Subscribed to ${count} event channels`);
    });

    this.subRedis.on('pmessage', (pattern, channel, message) => {
      try {
        const event = JSON.parse(message);
        this.emitter.emit('event', event);
        this.emitter.emit(event.type, event);
      } catch (err: any) {
        logger.error('Error parsing event message', { error: err.message });
      }
    });
  }

  /**
   * Store event in both Redis (fast) and PostgreSQL (durable)
   */
  async store(event: WorkflowEventV2): Promise<string> {
    const enrichedEvent = {
      ...event,
      timestamp: event.timestamp || new Date(),
      metadata: {
        correlationId: event.metadata?.correlationId || this.generateId(),
        causationId: event.metadata?.causationId,
        version: event.metadata?.version || 1,
      },
    };

    const eventJson = JSON.stringify(enrichedEvent);

    try {
      // 1. Add to Redis Stream (fast, real-time)
      const streamId = await this.redis.xadd(
        this.STREAM_KEY,
        '*',
        'data',
        eventJson
      );

      // 2. Publish to Redis Pub/Sub (real-time notifications)
      await this.pubRedis.publish(
        `${this.CHANNEL_PREFIX}${event.type}`,
        eventJson
      );
      await this.pubRedis.publish(
        `${this.CHANNEL_PREFIX}project:${event.projectId}`,
        eventJson
      );

      // 3. Persist to PostgreSQL (durable storage) - async, non-blocking
      this.persistToDatabase(enrichedEvent).catch((err) => {
        logger.error('Failed to persist event to PostgreSQL', {
          error: err.message,
          event: enrichedEvent,
        });
      });

      // 4. Trim old events from stream
      await this.redis.xtrim(
        this.STREAM_KEY,
        'MAXLEN',
        '~',
        this.MAX_STREAM_LENGTH
      );

      logger.debug('Event stored', {
        type: event.type,
        projectId: event.projectId,
        streamId,
      });

      return streamId;
    } catch (error: any) {
      logger.error('Failed to store event', {
        error: error.message,
        event,
      });
      throw error;
    }
  }

  /**
   * Persist event to PostgreSQL
   */
  private async persistToDatabase(event: WorkflowEventV2) {
    await this.prisma.event.create({
      data: {
        type: event.type,
        projectId: event.projectId,
        userId: event.userId,
        data: event.data,
        metadata: event.metadata || {},
        timestamp: event.timestamp || new Date(),
      },
    });
  }

  /**
   * Subscribe to events (real-time)
   */
  on(eventType: string, handler: (event: WorkflowEventV2) => void) {
    this.emitter.on(eventType, handler);
  }

  /**
   * Subscribe to all events
   */
  onAll(handler: (event: WorkflowEventV2) => void) {
    this.emitter.on('event', handler);
  }

  /**
   * Unsubscribe from events
   */
  off(eventType: string, handler: (event: WorkflowEventV2) => void) {
    this.emitter.off(eventType, handler);
  }

  /**
   * Get events from PostgreSQL (historical queries)
   */
  async query(filter: EventFilter): Promise<WorkflowEventV2[]> {
    const where: any = {};

    if (filter.projectId) where.projectId = filter.projectId;
    if (filter.userId) where.userId = filter.userId;
    if (filter.types) where.type = { in: filter.types };
    if (filter.from || filter.to) {
      where.timestamp = {};
      if (filter.from) where.timestamp.gte = filter.from;
      if (filter.to) where.timestamp.lte = filter.to;
    }

    const events = await this.prisma.event.findMany({
      where,
      orderBy: { timestamp: 'asc' },
      take: filter.limit || 1000,
    });

    return events.map((e) => ({
      type: e.type,
      projectId: e.projectId,
      userId: e.userId,
      data: e.data,
      timestamp: e.timestamp,
      metadata: e.metadata as any,
    }));
  }

  /**
   * Get project events (from PostgreSQL)
   */
  async getProjectEvents(projectId: string): Promise<WorkflowEventV2[]> {
    return this.query({ projectId });
  }

  /**
   * Replay events (Event Sourcing)
   */
  async replay(
    filter: EventFilter,
    handler: (event: WorkflowEventV2) => Promise<void>
  ) {
    const events = await this.query(filter);

    logger.info('Starting event replay', {
      count: events.length,
      filter,
    });

    let processed = 0;
    let failed = 0;

    for (const event of events) {
      try {
        await handler(event);
        processed++;

        if (processed % 100 === 0) {
          logger.info('Replay progress', {
            processed,
            total: events.length,
          });
        }
      } catch (err: any) {
        failed++;
        logger.error('Replay handler failed', {
          event,
          error: err.message,
        });
      }
    }

    logger.info('Event replay completed', {
      total: events.length,
      processed,
      failed,
    });

    return { total: events.length, processed, failed };
  }

  /**
   * Get event statistics
   */
  async getStats(projectId?: string) {
    const where = projectId ? { projectId } : {};

    const [total, byType] = await Promise.all([
      this.prisma.event.count({ where }),
      this.prisma.event.groupBy({
        by: ['type'],
        where,
        _count: true,
      }),
    ]);

    return {
      total,
      byType: Object.fromEntries(byType.map((t) => [t.type, t._count])),
    };
  }

  /**
   * Cleanup old events
   */
  async cleanup(olderThan: Date) {
    const result = await this.prisma.event.deleteMany({
      where: {
        timestamp: {
          lt: olderThan,
        },
      },
    });

    logger.info('Old events cleaned up', {
      deleted: result.count,
      olderThan,
    });

    return result.count;
  }

  /**
   * Close all connections
   */
  async close() {
    await Promise.all([
      this.redis.quit(),
      this.pubRedis.quit(),
      this.subRedis.quit(),
      this.prisma.$disconnect(),
    ]);

    this.emitter.removeAllListeners();

    logger.info('Event Store V2 closed');
  }

  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}

export const eventStoreV2 = new EventStoreV2();
