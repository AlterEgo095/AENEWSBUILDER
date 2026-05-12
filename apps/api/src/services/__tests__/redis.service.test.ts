/**
 * Unit tests for Redis Service (redis.service.ts)
 *
 * Validates that:
 * - initRedis() creates a Redis instance with correct config and retry strategy
 * - getRedis() throws when not initialized, returns instance after init
 * - CacheService.get/set/del/exists work correctly with JSON serialization
 * - CacheService.generateKey produces consistent hashes
 * - Error handling is graceful (returns null/false on failure)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mock ioredis (hoisted by vitest) ───────────────────────────────────────

const mockRedisInstance = {
  on: vi.fn(),
  get: vi.fn().mockResolvedValue(null),
  setex: vi.fn().mockResolvedValue('OK'),
  del: vi.fn().mockResolvedValue(1),
  exists: vi.fn().mockResolvedValue(0),
  ping: vi.fn().mockResolvedValue('PONG'),
  quit: vi.fn().mockResolvedValue('OK'),
};

vi.mock('ioredis', () => ({
  default: vi.fn(() => mockRedisInstance),
}));

// ─── Mock env config ─────────────────────────────────────────────────────────

vi.mock('../../config/env.js', () => ({
  config: {
    redis: {
      url: 'redis://localhost:6379',
      password: undefined,
    },
  },
}));

// ─── Mock logger ─────────────────────────────────────────────────────────────

vi.mock('../../config/logger.js', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  },
}));

// ─── Import after mocks ─────────────────────────────────────────────────────

import Redis from 'ioredis';
import { initRedis, getRedis, CacheService } from '../redis.service.js';

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('Redis Service', () => {
  // We need to reset the module-level singleton between tests.
  // Since redis.service.ts uses a module-level `redisClient`, we use
  // vi.resetModules() and dynamic imports to get fresh state.
  //
  // However, for simplicity and speed, we test initRedis once for
  // side effects and focus on CacheService (which calls getRedis internally).

  // ═══════════════════════════════════════════════════════════════════════════
  // initRedis()
  // ═══════════════════════════════════════════════════════════════════════════

  describe('initRedis()', () => {
    it('should create a Redis instance with correct URL', async () => {
      // Reset modules to clear the singleton, but the top-level vi.mock stays active
      vi.resetModules();

      const { initRedis: freshInit } = await import('../redis.service.js');

      const result = await freshInit();

      expect(Redis).toHaveBeenCalledWith(
        'redis://localhost:6379',
        expect.objectContaining({
          password: undefined,
          maxRetriesPerRequest: 3,
          enableReadyCheck: true,
          lazyConnect: false,
        })
      );
      expect(result).toBeDefined();
    });

    it('should set up retry strategy', async () => {
      vi.resetModules();

      const { initRedis: freshInit } = await import('../redis.service.js');
      await freshInit();

      expect(Redis).toHaveBeenCalledWith(
        'redis://localhost:6379',
        expect.objectContaining({
          retryStrategy: expect.any(Function),
        })
      );
    });

    it('should register event handlers on the Redis instance', async () => {
      vi.resetModules();

      const { initRedis: freshInit } = await import('../redis.service.js');

      mockRedisInstance.on.mockClear();
      await freshInit();

      expect(mockRedisInstance.on).toHaveBeenCalledWith('connect', expect.any(Function));
      expect(mockRedisInstance.on).toHaveBeenCalledWith('error', expect.any(Function));
      expect(mockRedisInstance.on).toHaveBeenCalledWith('ready', expect.any(Function));
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // getRedis()
  // ═══════════════════════════════════════════════════════════════════════════

  describe('getRedis()', () => {
    it('should throw if not initialized', async () => {
      vi.resetModules();

      const { getRedis: freshGet } = await import('../redis.service.js');

      expect(() => freshGet()).toThrow('Redis not initialized');
    });

    it('should return instance after init', async () => {
      vi.resetModules();

      const mod = await import('../redis.service.js');
      await mod.initRedis();
      const client = mod.getRedis();

      expect(client).toBeDefined();
    });
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// CacheService
// ═════════════════════════════════════════════════════════════════════════════

describe('CacheService', () => {
  let cache: CacheService;

  beforeEach(async () => {
    vi.clearAllMocks();

    // Reset all mocks to defaults
    mockRedisInstance.get.mockResolvedValue(null);
    mockRedisInstance.setex.mockResolvedValue('OK');
    mockRedisInstance.del.mockResolvedValue(1);
    mockRedisInstance.exists.mockResolvedValue(0);

    // Initialize redis for CacheService to work
    await initRedis();
    cache = new CacheService();
  });

  // ────────────────────────────────────────────
  // get()
  // ────────────────────────────────────────────

  describe('get()', () => {
    it('should parse JSON from Redis and return it', async () => {
      const data = { name: 'test', value: 42 };
      mockRedisInstance.get.mockResolvedValue(JSON.stringify(data));

      const result = await cache.get('key1');

      expect(mockRedisInstance.get).toHaveBeenCalledWith('key1');
      expect(result).toEqual(data);
    });

    it('should return null for missing key', async () => {
      mockRedisInstance.get.mockResolvedValue(null);

      const result = await cache.get('missing-key');

      expect(result).toBeNull();
    });

    it('should handle invalid JSON gracefully and return null', async () => {
      mockRedisInstance.get.mockResolvedValue('{invalid json}');

      const result = await cache.get('bad-key');

      expect(result).toBeNull();
    });

    it('should return null and log error when Redis throws', async () => {
      mockRedisInstance.get.mockRejectedValue(new Error('Connection lost'));

      const result = await cache.get('key');

      expect(result).toBeNull();
    });
  });

  // ────────────────────────────────────────────
  // set()
  // ────────────────────────────────────────────

  describe('set()', () => {
    it('should stringify value and call setex with TTL', async () => {
      const data = { items: [1, 2, 3] };

      await cache.set('mykey', data, 3600);

      expect(mockRedisInstance.setex).toHaveBeenCalledWith(
        'mykey',
        3600,
        JSON.stringify(data)
      );
    });

    it('should handle errors gracefully', async () => {
      mockRedisInstance.setex.mockRejectedValue(new Error('Write failed'));

      // Should not throw
      await expect(cache.set('key', 'value', 60)).resolves.toBeUndefined();
    });
  });

  // ────────────────────────────────────────────
  // del()
  // ────────────────────────────────────────────

  describe('del()', () => {
    it('should call Redis del with the key', async () => {
      await cache.del('mykey');

      expect(mockRedisInstance.del).toHaveBeenCalledWith('mykey');
    });

    it('should handle errors gracefully', async () => {
      mockRedisInstance.del.mockRejectedValue(new Error('Delete failed'));

      await expect(cache.del('key')).resolves.toBeUndefined();
    });
  });

  // ────────────────────────────────────────────
  // exists()
  // ────────────────────────────────────────────

  describe('exists()', () => {
    it('should return true when Redis returns 1', async () => {
      mockRedisInstance.exists.mockResolvedValue(1);

      const result = await cache.exists('mykey');

      expect(result).toBe(true);
    });

    it('should return false when Redis returns 0', async () => {
      mockRedisInstance.exists.mockResolvedValue(0);

      const result = await cache.exists('mykey');

      expect(result).toBe(false);
    });
  });

  // ────────────────────────────────────────────
  // generateKey()
  // ────────────────────────────────────────────

  describe('generateKey()', () => {
    it('should create a consistent hash for the same data', () => {
      const key1 = cache.generateKey('prompt', { text: 'hello', model: 'gpt-4' });
      const key2 = cache.generateKey('prompt', { text: 'hello', model: 'gpt-4' });

      expect(key1).toBe(key2);
    });

    it('should include the prefix in the key', () => {
      const key = cache.generateKey('project', { id: 123 });

      expect(key).toMatch(/^project:/);
    });

    it('should produce different keys for different data', () => {
      const key1 = cache.generateKey('prompt', { text: 'hello' });
      const key2 = cache.generateKey('prompt', { text: 'world' });

      expect(key1).not.toBe(key2);
    });

    it('should handle different data types', () => {
      // Object data
      const objKey = cache.generateKey('test', { a: 1, b: [1, 2] });
      expect(objKey).toMatch(/^test:/);
      expect(typeof objKey).toBe('string');

      // String data
      const strKey = cache.generateKey('test', 'simple string');
      expect(strKey).toMatch(/^test:/);

      // Array data
      const arrKey = cache.generateKey('test', [1, 2, 3]);
      expect(arrKey).toMatch(/^test:/);

      // Number data
      const numKey = cache.generateKey('test', 42);
      expect(numKey).toMatch(/^test:/);
    });

    it('should produce a string hash', () => {
      const key = cache.generateKey('prefix', { x: 1 });

      // After the colon should be the hash
      const parts = key.split(':');
      expect(parts.length).toBe(2);
      expect(typeof parts[1]).toBe('string');
      expect(parts[1].length).toBeGreaterThan(0);
    });
  });

  // ────────────────────────────────────────────
  // simpleHash (tested via generateKey)
  // ────────────────────────────────────────────

  describe('simpleHash (via generateKey)', () => {
    it('should produce deterministic hash values', () => {
      const data = 'test-input-data';
      const keys = Array.from({ length: 5 }, () => cache.generateKey('h', data));

      // All should be identical
      expect(new Set(keys).size).toBe(1);
    });

    it('should produce hash as base-36 string', () => {
      const key = cache.generateKey('h', { n: 12345 });
      const hash = key.split(':')[1];

      // Base-36 characters only
      expect(hash).toMatch(/^[0-9a-z]+$/);
    });
  });
});
