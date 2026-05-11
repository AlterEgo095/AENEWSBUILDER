/**
 * Environment Configuration with Type Safety
 */

import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

const envSchema = z.object({
  // Server
  API_PORT: z.string().transform(Number).default('3001'),
  API_HOST: z.string().default('0.0.0.0'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  
  // Database
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  REDIS_PASSWORD: z.string().optional(),
  REDIS_HOST: z.string().default('localhost'),
  REDIS_PORT: z.string().transform(Number).default('6379'),
  
  // JWT
  JWT_SECRET: z.string().min(32),
  JWT_EXPIRES_IN: z.string().default('7d'),
  JWT_PRIVATE_KEY_PATH: z.string().default('./secrets/jwt-private.pem'),
  JWT_PUBLIC_KEY_PATH: z.string().default('./secrets/jwt-public.pem'),
  
  // OpenAI
  OPENAI_API_KEY: z.string().startsWith('sk-'),
  
  // Anthropic
  ANTHROPIC_API_KEY: z.string().startsWith('sk-ant-'),
  
  // CORS
  CORS_ORIGINS: z.string().transform((str) => str.split(',')),
  FRONTEND_URL: z.string().url(),
  
  // Security
  HELMET_ENABLED: z.string().transform((v) => v === 'true').default('true'),
  CSP_ENABLED: z.string().transform((v) => v === 'true').default('true'),
  
  // Rate Limiting
  RATE_LIMIT_WINDOW_MS: z.string().transform(Number).default('60000'),
  RATE_LIMIT_MAX_REQUESTS: z.string().transform(Number).default('100'),
  
  // Caching
  CACHE_TTL_CLASSIFICATION: z.string().transform(Number).default('86400'),
  CACHE_TTL_PLAN: z.string().transform(Number).default('3600'),
  CACHE_TTL_GENERATION: z.string().transform(Number).default('1800'),
  
  // Sandbox
  SANDBOX_MEMORY_LIMIT: z.string().default('512m'),
  SANDBOX_CPU_LIMIT: z.string().default('0.5'),
  SANDBOX_TIMEOUT: z.string().transform(Number).default('30000'),
  SANDBOX_POOL_SIZE: z.string().transform(Number).default('3'),
  
  // Worker
  BULLMQ_CONCURRENCY: z.string().transform(Number).default('5'),
  AUTO_HEALING_MAX_RETRIES: z.string().transform(Number).default('3'),
  
  // Monitoring
  SENTRY_DSN: z.string().url().optional(),
  SENTRY_ENVIRONMENT: z.string().default('development'),
  
  // Cost Management
  MAX_TOKENS_PER_REQUEST: z.string().transform(Number).default('8000'),
  COST_ALERT_THRESHOLD_DAILY: z.string().transform(Number).default('10'),
});

export const env = envSchema.parse(process.env);

export const config = {
  server: {
    port: env.API_PORT,
    host: env.API_HOST,
    nodeEnv: env.NODE_ENV,
  },
  database: {
    url: env.DATABASE_URL,
  },
  redis: {
    url: env.REDIS_URL,
    host: env.REDIS_HOST,
    port: env.REDIS_PORT,
    password: env.REDIS_PASSWORD,
  },
  jwt: {
    secret: env.JWT_SECRET,
    expiresIn: env.JWT_EXPIRES_IN,
    privateKeyPath: env.JWT_PRIVATE_KEY_PATH,
    publicKeyPath: env.JWT_PUBLIC_KEY_PATH,
  },
  openai: {
    apiKey: env.OPENAI_API_KEY,
  },
  anthropic: {
    apiKey: env.ANTHROPIC_API_KEY,
  },
  cors: {
    origins: env.CORS_ORIGINS,
    frontendUrl: env.FRONTEND_URL,
  },
  security: {
    helmetEnabled: env.HELMET_ENABLED,
  },
  csp: {
    enabled: env.CSP_ENABLED,
  },
  rateLimit: {
    windowMs: env.RATE_LIMIT_WINDOW_MS,
    maxRequests: env.RATE_LIMIT_MAX_REQUESTS,
  },
  cache: {
    ttl: {
      classification: env.CACHE_TTL_CLASSIFICATION,
      plan: env.CACHE_TTL_PLAN,
      generation: env.CACHE_TTL_GENERATION,
    },
  },
  sandbox: {
    memoryLimit: env.SANDBOX_MEMORY_LIMIT,
    cpuLimit: env.SANDBOX_CPU_LIMIT,
    timeout: env.SANDBOX_TIMEOUT,
    poolSize: env.SANDBOX_POOL_SIZE,
  },
  worker: {
    concurrency: env.BULLMQ_CONCURRENCY,
    autoHealingMaxRetries: env.AUTO_HEALING_MAX_RETRIES,
  },
  monitoring: {
    sentryDsn: env.SENTRY_DSN,
    sentryEnvironment: env.SENTRY_ENVIRONMENT,
  },
  cost: {
    maxTokensPerRequest: env.MAX_TOKENS_PER_REQUEST,
    alertThresholdDaily: env.COST_ALERT_THRESHOLD_DAILY,
  },
} as const;
