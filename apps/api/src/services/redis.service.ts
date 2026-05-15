/**
 * Redis Service - Centralized Redis Connection with Sentinel Support
 * v3 — Adds Redis Sentinel for High Availability automatic failover
 * 
 * When REDIS_SENTINEL_ENABLED=true, connects via Sentinel cluster
 * for automatic master discovery and failover.
 * Falls back to direct connection when Sentinel is disabled.
 */

import Redis from 'ioredis';
import { config } from '../config/env.js';
import { logger } from '../config/logger.js';

let redisClient: Redis | null = null;
let connectionLogged = false;

/**
 * Create a Redis client with Sentinel or direct connection
 */
function createRedisClient(): Redis {
  const sentinelEnabled = process.env.REDIS_SENTINEL_ENABLED === 'true';

  if (sentinelEnabled) {
    const sentinelHosts = [
      { host: process.env.REDIS_SENTINEL_HOST_1 || 'redis-sentinel-1', port: 26379 },
      { host: process.env.REDIS_SENTINEL_HOST_2 || 'redis-sentinel-2', port: 26379 },
      { host: process.env.REDIS_SENTINEL_HOST_3 || 'redis-sentinel-3', port: 26379 },
    ];

    const redisPassword = config.redis.password || process.env.REDIS_PASSWORD;

    logger.info(
      { sentinelHosts: sentinelHosts.map(s => s.host), masterName: 'aenewsb_master' },
      'Redis Sentinel mode enabled — connecting via sentinels'
    );

    return new Redis({
      sentinels: sentinelHosts,
      name: 'aenewsb_master',
      password: redisPassword,
      sentinelPassword: redisPassword,
      maxRetriesPerRequest: null, // Required by BullMQ
      enableReadyCheck: true,
      lazyConnect: false,
      retryStrategy(times) {
        if (times > 50) {
          return 10000; // Slow down after 50 retries
        }
        const delay = Math.min(times * 100, 3000);
        return delay;
      },
    });
  }

  // Fallback to direct connection
  const parsedUrl = new URL(config.redis.url);
  const redisPassword = config.redis.password || (parsedUrl.password || undefined);

  return new Redis(config.redis.url, {
    ...(parsedUrl.password ? {} : { password: redisPassword }),
    maxRetriesPerRequest: null, // Required by BullMQ
    enableReadyCheck: true,
    lazyConnect: false,
    retryStrategy(times) {
      if (times > 50) {
        return 10000;
      }
      const delay = Math.min(times * 100, 3000);
      return delay;
    },
  });
}

export async function initRedis(): Promise<Redis> {
  if (redisClient) {
    return redisClient;
  }

  redisClient = createRedisClient();
  // Wait for Redis to be ready before returning (max 10s)
  if (redisClient.status !== "ready") {
    await new Promise<void>((resolve) => {
      const timeout = setTimeout(() => {
        logger.warn("Redis connection not ready after 10s, continuing...");
        resolve();
      }, 10000);
      redisClient!.once("ready", () => { clearTimeout(timeout); resolve(); });
      redisClient!.once("error", () => { clearTimeout(timeout); resolve(); });
    });
  }

  redisClient.on('connect', () => {
    if (!connectionLogged) {
      logger.info('Redis connected');
    }
  });

  redisClient.on('error', (err) => {
    const msg = err?.message || String(err);
    if (msg.includes('ECONNREFUSED') || msg.includes('ECONNRESET')) {
      if (!connectionLogged) {
        logger.warn({ err: msg }, 'Redis connection issue (will retry silently)');
      }
    } else {
      logger.error({ err: msg }, 'Redis error');
    }
  });

  redisClient.on('ready', () => {
    if (!connectionLogged) {
      const mode = process.env.REDIS_SENTINEL_ENABLED === 'true' ? 'Sentinel' : 'Direct';
      logger.info(`Redis ready (${mode} mode)`);
      connectionLogged = true;
    }
  });

  redisClient.on('close', () => {
    connectionLogged = false;
  });

  redisClient.on('+switch-master', (data) => {
    logger.info(
      { name: data.name, oldHost: data.oldHost, newHost: data.newHost },
      'Redis Sentinel: Master switched'
    );
  });

  return redisClient;
}

export function getRedis(): Redis {
  if (!redisClient) {
    throw new Error('Redis not initialized. Call initRedis() first.');
  }
  return redisClient;
}

export async function closeRedis(): Promise<void> {
  if (redisClient) {
    redisClient.disconnect();
    redisClient = null;
    connectionLogged = false;
  }
}

/**
 * Cache Helper with TTL
 */
export class CacheService {
  private _redis: Redis | null = null;

  /** Lazily get Redis connection (safe to call before initRedis) */
  private get redis(): Redis {
    if (!this._redis) {
      try {
        this._redis = getRedis();
      } catch {
        throw new Error('Redis not initialized yet. Ensure initRedis() is called before using CacheService.');
      }
    }
    return this._redis;
  }

  /**
   * Get cached value
   */
  async get<T>(key: string): Promise<T | null> {
    try {
      const value = await this.redis.get(key);
      return value ? JSON.parse(value) : null;
    } catch (error) {
      logger.error({ error, key }, 'Cache get error');
      return null;
    }
  }

  /**
   * Set cached value with TTL
   */
  async set(key: string, value: any, ttl: number): Promise<void> {
    try {
      await this.redis.setex(key, ttl, JSON.stringify(value));
    } catch (error) {
      logger.error({ error, key }, 'Cache set error');
    }
  }

  /**
   * Delete cached value
   */
  async del(key: string): Promise<void> {
    try {
      await this.redis.del(key);
    } catch (error) {
      logger.error({ error, key }, 'Cache delete error');
    }
  }

  /**
   * Check if key exists
   */
  async exists(key: string): Promise<boolean> {
    try {
      const result = await this.redis.exists(key);
      return result === 1;
    } catch (error) {
      logger.error({ error, key }, 'Cache exists error');
      return false;
    }
  }

  /**
   * Generate cache key from prompt
   */
  generateKey(prefix: string, data: any): string {
    const hash = this.simpleHash(JSON.stringify(data));
    return `${prefix}:${hash}`;
  }

  /**
   * Simple hash function
   */
  private simpleHash(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(36);
  }
}

