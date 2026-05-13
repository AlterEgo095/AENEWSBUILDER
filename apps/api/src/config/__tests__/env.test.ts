/**
 * Unit tests for environment configuration (env.ts)
 *
 * Validates that the zod schema correctly:
 * - Accepts valid environment variables
 * - Rejects missing required variables
 * - Enforces constraints (min-length, prefixes, enum values)
 * - Applies defaults and transforms
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock dotenv to prevent loading the real .env file.
// The source uses `import dotenv from 'dotenv'` (default import), so we must
// provide a __esModule + default mock.
vi.mock('dotenv', () => ({
  __esModule: true,
  default: { config: vi.fn() },
}));

/**
 * Helper: build a complete set of valid env vars for testing.
 * All required fields are provided with valid values.
 */
function validEnv(overrides: Record<string, string | undefined> = {}): Record<string, string | undefined> {
  return {
    DATABASE_URL: 'postgresql://user:pass@localhost:5432/mydb',
    REDIS_URL: 'redis://localhost:6379',
    JWT_SECRET: 'a'.repeat(64), // 64 chars, well above the 32-char minimum
    OPENAI_API_KEY: 'sk-test-openai-key-12345',
    ANTHROPIC_API_KEY: 'sk-ant-test-anthropic-key-67890',
    CORS_ORIGINS: 'http://localhost:3000,https://example.com',
    FRONTEND_URL: 'https://example.com',
    ...overrides,
  };
}

describe('config/env', () => {
  beforeEach(() => {
    // Reset modules so each test gets a fresh import
    vi.resetModules();

    // Clean ALL env vars that the schema cares about to prevent stale values
    // from a previous test leaking into the next (since env.ts reads process.env
    // at module level and vi.resetModules forces a re-evaluation).
    const envKeys = [
      'API_PORT', 'API_HOST', 'NODE_ENV',
      'DATABASE_URL', 'REDIS_URL', 'REDIS_PASSWORD', 'REDIS_HOST', 'REDIS_PORT',
      'JWT_SECRET', 'JWT_EXPIRES_IN', 'JWT_PRIVATE_KEY_PATH', 'JWT_PUBLIC_KEY_PATH',
      'OPENAI_API_KEY', 'ANTHROPIC_API_KEY',
      'CORS_ORIGINS', 'FRONTEND_URL',
      'HELMET_ENABLED', 'CSP_ENABLED',
      'RATE_LIMIT_WINDOW_MS', 'RATE_LIMIT_MAX_REQUESTS',
      'CACHE_TTL_CLASSIFICATION', 'CACHE_TTL_PLAN', 'CACHE_TTL_GENERATION',
      'SANDBOX_MEMORY_LIMIT', 'SANDBOX_CPU_LIMIT', 'SANDBOX_TIMEOUT', 'SANDBOX_POOL_SIZE',
      'BULLMQ_CONCURRENCY', 'AUTO_HEALING_MAX_RETRIES',
      'SENTRY_DSN', 'SENTRY_ENVIRONMENT',
      'OTEL_EXPORTER_OTLP_ENDPOINT', 'OTEL_SERVICE_NAME',
      'MAX_TOKENS_PER_REQUEST', 'COST_ALERT_THRESHOLD_DAILY',
    ];
    for (const key of envKeys) {
      delete process.env[key];
    }
  });

  // ────────────────────────────────────────────
  // Valid environment
  // ────────────────────────────────────────────

  it('should parse valid env vars successfully', async () => {
    // Set all required env vars before import
    const envVars = validEnv();
    for (const [key, value] of Object.entries(envVars)) {
      process.env[key] = value ?? '';
    }

    const { env, config } = await import('../env.js');

    expect(env).toBeDefined();
    expect(config).toBeDefined();
    expect(config.server.port).toBe(3001);
    expect(config.server.host).toBe('0.0.0.0');
    expect(config.openai.apiKey).toBe('sk-test-openai-key-12345');
    expect(config.anthropic.apiKey).toBe('sk-ant-test-anthropic-key-67890');
  });

  // ────────────────────────────────────────────
  // Missing required keys
  // ────────────────────────────────────────────

  it('should throw ZodError when OPENAI_API_KEY is missing', async () => {
    const envVars = validEnv({ OPENAI_API_KEY: undefined });
    for (const [key, value] of Object.entries(envVars)) {
      if (value !== undefined) process.env[key] = value;
      else delete process.env[key];
    }

    // Importing should throw because the schema is parsed at module level
    await expect(() => import('../env.js')).rejects.toThrow();
  });

  it('should throw ZodError when ANTHROPIC_API_KEY is missing', async () => {
    const envVars = validEnv({ ANTHROPIC_API_KEY: undefined });
    for (const [key, value] of Object.entries(envVars)) {
      if (value !== undefined) process.env[key] = value;
      else delete process.env[key];
    }

    await expect(() => import('../env.js')).rejects.toThrow();
  });

  // ────────────────────────────────────────────
  // JWT_SECRET constraint
  // ────────────────────────────────────────────

  it('should throw ZodError when JWT_SECRET is shorter than 32 characters', async () => {
    const envVars = validEnv({ JWT_SECRET: 'too-short-secret' }); // only 16 chars
    for (const [key, value] of Object.entries(envVars)) {
      process.env[key] = value ?? '';
    }

    await expect(() => import('../env.js')).rejects.toThrow();
  });

  // ────────────────────────────────────────────
  // Default values
  // ────────────────────────────────────────────

  it('should default API_PORT to 3001 when not set', async () => {
    const envVars = validEnv({ API_PORT: undefined });
    for (const [key, value] of Object.entries(envVars)) {
      if (value !== undefined) process.env[key] = value;
      else delete process.env[key];
    }

    const { env } = await import('../env.js');
    expect(env.API_PORT).toBe(3001);
  });

  it('should default NODE_ENV to "development" when not set', async () => {
    const envVars = validEnv({ NODE_ENV: undefined });
    for (const [key, value] of Object.entries(envVars)) {
      if (value !== undefined) process.env[key] = value;
      else delete process.env[key];
    }

    const { env } = await import('../env.js');
    expect(env.NODE_ENV).toBe('development');
  });

  it('should accept explicit API_PORT value and transform to number', async () => {
    const envVars = validEnv({ API_PORT: '8080' });
    for (const [key, value] of Object.entries(envVars)) {
      process.env[key] = value ?? '';
    }

    const { env } = await import('../env.js');
    expect(env.API_PORT).toBe(8080);
    expect(typeof env.API_PORT).toBe('number');
  });

  // ────────────────────────────────────────────
  // CORS_ORIGINS transform
  // ────────────────────────────────────────────

  it('should split CORS_ORIGINS into an array of strings', async () => {
    const envVars = validEnv({ CORS_ORIGINS: 'http://a.com,http://b.com,http://c.com' });
    for (const [key, value] of Object.entries(envVars)) {
      process.env[key] = value ?? '';
    }

    const { env, config } = await import('../env.js');

    // env.CORS_ORIGINS should be an array
    expect(Array.isArray(env.CORS_ORIGINS)).toBe(true);
    expect(env.CORS_ORIGINS).toEqual(['http://a.com', 'http://b.com', 'http://c.com']);

    // config.cors.origins should mirror it
    expect(config.cors.origins).toEqual(['http://a.com', 'http://b.com', 'http://c.com']);
  });

  it('should handle single CORS origin (no comma)', async () => {
    const envVars = validEnv({ CORS_ORIGINS: 'http://localhost:3000' });
    for (const [key, value] of Object.entries(envVars)) {
      process.env[key] = value ?? '';
    }

    const { env } = await import('../env.js');
    expect(env.CORS_ORIGINS).toEqual(['http://localhost:3000']);
  });

  // ────────────────────────────────────────────
  // HELMET_ENABLED boolean transform
  // ────────────────────────────────────────────

  it('should transform HELMET_ENABLED="true" to boolean true', async () => {
    const envVars = validEnv({ HELMET_ENABLED: 'true' });
    for (const [key, value] of Object.entries(envVars)) {
      process.env[key] = value ?? '';
    }

    const { env, config } = await import('../env.js');
    expect(env.HELMET_ENABLED).toBe(true);
    expect(config.security.helmetEnabled).toBe(true);
  });

  it('should transform HELMET_ENABLED="false" to boolean false', async () => {
    const envVars = validEnv({ HELMET_ENABLED: 'false' });
    for (const [key, value] of Object.entries(envVars)) {
      process.env[key] = value ?? '';
    }

    const { env, config } = await import('../env.js');
    expect(env.HELMET_ENABLED).toBe(false);
    expect(config.security.helmetEnabled).toBe(false);
  });

  it('should default HELMET_ENABLED to true when not set', async () => {
    const envVars = validEnv({ HELMET_ENABLED: undefined });
    for (const [key, value] of Object.entries(envVars)) {
      if (value !== undefined) process.env[key] = value;
      else delete process.env[key];
    }

    const { env } = await import('../env.js');
    expect(env.HELMET_ENABLED).toBe(true);
  });

  // ────────────────────────────────────────────
  // NODE_ENV enum validation
  // ────────────────────────────────────────────

  it('should accept NODE_ENV="production"', async () => {
    const envVars = validEnv({ NODE_ENV: 'production' });
    for (const [key, value] of Object.entries(envVars)) {
      process.env[key] = value ?? '';
    }

    const { env } = await import('../env.js');
    expect(env.NODE_ENV).toBe('production');
  });

  it('should accept NODE_ENV="test"', async () => {
    const envVars = validEnv({ NODE_ENV: 'test' });
    for (const [key, value] of Object.entries(envVars)) {
      process.env[key] = value ?? '';
    }

    const { env } = await import('../env.js');
    expect(env.NODE_ENV).toBe('test');
  });

  it('should reject invalid NODE_ENV value', async () => {
    const envVars = validEnv({ NODE_ENV: 'staging' });
    for (const [key, value] of Object.entries(envVars)) {
      process.env[key] = value ?? '';
    }

    await expect(() => import('../env.js')).rejects.toThrow();
  });

  // ────────────────────────────────────────────
  // OPENAI_API_KEY prefix validation
  // ────────────────────────────────────────────

  it('should reject OPENAI_API_KEY that does not start with "sk-"', async () => {
    const envVars = validEnv({ OPENAI_API_KEY: 'invalid-key-no-prefix' });
    for (const [key, value] of Object.entries(envVars)) {
      process.env[key] = value ?? '';
    }

    await expect(() => import('../env.js')).rejects.toThrow();
  });

  // ────────────────────────────────────────────
  // ANTHROPIC_API_KEY prefix validation
  // ────────────────────────────────────────────

  it('should reject ANTHROPIC_API_KEY that does not start with "sk-ant-"', async () => {
    const envVars = validEnv({ ANTHROPIC_API_KEY: 'sk-wrong-prefix' });
    for (const [key, value] of Object.entries(envVars)) {
      process.env[key] = value ?? '';
    }

    await expect(() => import('../env.js')).rejects.toThrow();
  });

  // ────────────────────────────────────────────
  // DATABASE_URL validation
  // ────────────────────────────────────────────

  it('should reject invalid DATABASE_URL format', async () => {
    const envVars = validEnv({ DATABASE_URL: 'not-a-url' });
    for (const [key, value] of Object.entries(envVars)) {
      process.env[key] = value ?? '';
    }

    await expect(() => import('../env.js')).rejects.toThrow();
  });

  // ────────────────────────────────────────────
  // config object structure
  // ────────────────────────────────────────────

  it('should export a config object with all expected sections', async () => {
    const envVars = validEnv();
    for (const [key, value] of Object.entries(envVars)) {
      process.env[key] = value ?? '';
    }

    const { config } = await import('../env.js');

    // Verify all top-level config sections exist
    expect(config).toHaveProperty('server');
    expect(config).toHaveProperty('database');
    expect(config).toHaveProperty('redis');
    expect(config).toHaveProperty('jwt');
    expect(config).toHaveProperty('openai');
    expect(config).toHaveProperty('anthropic');
    expect(config).toHaveProperty('cors');
    expect(config).toHaveProperty('security');
    expect(config).toHaveProperty('csp');
    expect(config).toHaveProperty('rateLimit');
    expect(config).toHaveProperty('cache');
    expect(config).toHaveProperty('sandbox');
    expect(config).toHaveProperty('worker');
    expect(config).toHaveProperty('monitoring');
    expect(config).toHaveProperty('tracing');
    expect(config).toHaveProperty('cost');
  });

  // ────────────────────────────────────────────
  // Numeric transform defaults
  // ────────────────────────────────────────────

  it('should apply default RATE_LIMIT_WINDOW_MS as number', async () => {
    const envVars = validEnv({ RATE_LIMIT_WINDOW_MS: undefined });
    for (const [key, value] of Object.entries(envVars)) {
      if (value !== undefined) process.env[key] = value;
      else delete process.env[key];
    }

    const { env } = await import('../env.js');
    expect(env.RATE_LIMIT_WINDOW_MS).toBe(60000);
    expect(typeof env.RATE_LIMIT_WINDOW_MS).toBe('number');
  });
});
