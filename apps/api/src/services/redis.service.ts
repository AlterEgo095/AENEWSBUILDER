/**
 * Redis Service - Centralized Redis Connection
 * v2 — Suppresses reconnection spam, handles errors gracefully
 */

import Redis from 'ioredis';
import { config } from '../config/env.js';
import { logger } from '../config/logger.js';

let redisClient: Redis | null = null;
let connectionLogged = false;

export async function initRedis(): Promise<Redis> {
  if (redisClient) {
    return redisClient;
  }

  redisClient = new Redis(config.redis.url, {
    password: config.redis.password,
    maxRetriesPerRequest: null, // Required by BullMQ
    enableReadyCheck: true,
    lazyConnect: false,
    retryStrategy(times) {
      if (times > 50) {
        // After 50 retries, slow down significantly
        return 10000;
      }
      const delay = Math.min(times * 100, 3000);
      return delay;
    },
  });

  redisClient.on('connect', () => {
    if (!connectionLogged) {
      logger.info('Redis connected');
    }
  });

  redisClient.on('error', (err) => {
    // Only log ECONNREFUSED once to avoid spam
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
      logger.info('Redis ready');
      connectionLogged = true;
    }
  });

  redisClient.on('close', () => {
    connectionLogged = false;
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
