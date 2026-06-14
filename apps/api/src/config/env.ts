/**
 * Environment Configuration with Type Safety
 * 
 * v2.1 — DashScope-primary. OpenAI/Anthropic are OPTIONAL.
 * Phase 2: Added Sentinel, Worker Mode, Read Replica support.
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
  DATABASE_READ_URL: z.string().optional(),
  REDIS_URL: z.string().url(),
  REDIS_PASSWORD: z.string().optional(),
  REDIS_HOST: z.string().default('localhost'),
  REDIS_PORT: z.string().transform(Number).default('6379'),
  
  // Redis Sentinel (Phase 2)
  REDIS_SENTINEL_ENABLED: z.string().transform((v) => v === 'true').default('false'),
  REDIS_SENTINEL_HOST_1: z.string().default('redis-sentinel-1'),
  REDIS_SENTINEL_HOST_2: z.string().default('redis-sentinel-2'),
  REDIS_SENTINEL_HOST_3: z.string().default('redis-sentinel-3'),
  
  // Worker Mode (Phase 2)
  WORKER_MODE: z.string().transform((v) => v === 'true').default('false'),
  
  // JWT
  JWT_SECRET: z.string().min(1),
  JWT_EXPIRES_IN: z.string().default('7d'),
  JWT_PRIVATE_KEY_PATH: z.string().default('./secrets/jwt-private.pem'),
  JWT_PUBLIC_KEY_PATH: z.string().default('./secrets/jwt-public.pem'),
  
  // OpenAI (OPTIONAL — DashScope is primary)
  OPENAI_API_KEY: z.string().optional().default(''),
  
  // Anthropic (OPTIONAL — DashScope is primary)
  ANTHROPIC_API_KEY: z.string().optional().default(''),

  // Alibaba Cloud DashScope (PRIMARY AI)
  DASHSCOPE_API_KEY: z.string().optional(),
  DASHSCOPE_BASE_URL: z.string().default('https://dashscope-intl.aliyuncs.com/compatible-mode/v1'),
  DASHSCOPE_ENABLED: z.string().transform((v) => v === 'true').default('true'),
  
  // DeepSeek (low-cost alternative)
  DEEPSEEK_API_KEY: z.string().optional().default(''),
  DEEPSEEK_BASE_URL: z.string().default('https://api.deepseek.com/v1'),
  
  // Google Gemini
  GEMINI_API_KEY: z.string().optional().default(''),
  GEMINI_BASE_URL: z.string().default('https://generativelanguage.googleapis.com/v1beta/openai/'),
  
  // Ollama (local/self-hosted)
  OLLAMA_ENABLED: z.string().transform((v) => v === 'true').default('false'),
  OLLAMA_BASE_URL: z.string().default('http://localhost:11434/v1'),
  
  // CORS
  CORS_ORIGINS: z.string()
    .transform((str) => str.split(',').filter(Boolean))
    .refine(
      (origins) => {
        if (process.env.NODE_ENV === 'production' && origins.includes('*')) {
          return false;
        }
        return true;
      },
      { message: "CORS_ORIGINS must not include '*' in production environment" }
    ),
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
  
  // OpenTelemetry Tracing
  OTEL_EXPORTER_OTLP_ENDPOINT: z.string().optional().default(''),
  OTEL_SERVICE_NAME: z.string().optional().default('aenews-api'),
  
  // Cost Management
  MAX_TOKENS_PER_REQUEST: z.string().transform(Number).default('32768'),
  COST_ALERT_THRESHOLD_DAILY: z.string().transform(Number).default('10'),
});

export const env = envSchema.parse(process.env);

export const config = {
  server: {
    port: env.API_PORT,
    host: env.API_HOST,
    nodeEnv: env.NODE_ENV,
    serviceName: env.OTEL_SERVICE_NAME,
  },
  database: {
    url: env.DATABASE_URL,
    readUrl: env.DATABASE_READ_URL || env.DATABASE_URL,
  },
  redis: {
    url: env.REDIS_URL,
    host: env.REDIS_HOST,
    port: env.REDIS_PORT,
    password: env.REDIS_PASSWORD,
    sentinel: {
      enabled: env.REDIS_SENTINEL_ENABLED,
      hosts: [
        { host: env.REDIS_SENTINEL_HOST_1, port: 26379 },
        { host: env.REDIS_SENTINEL_HOST_2, port: 26379 },
        { host: env.REDIS_SENTINEL_HOST_3, port: 26379 },
      ],
      masterName: 'aenewsb_master',
    },
  },
  worker: {
    mode: env.WORKER_MODE,
    concurrency: env.BULLMQ_CONCURRENCY,
    autoHealingMaxRetries: env.AUTO_HEALING_MAX_RETRIES,
  },
  jwt: {
    secret: env.JWT_SECRET,
    expiresIn: env.JWT_EXPIRES_IN,
    privateKeyPath: env.JWT_PRIVATE_KEY_PATH,
    publicKeyPath: env.JWT_PUBLIC_KEY_PATH,
  },
  openai: {
    apiKey: env.OPENAI_API_KEY || '',
    enabled: !!env.OPENAI_API_KEY && !env.OPENAI_API_KEY.includes('placeholder'),
  },
  anthropic: {
    apiKey: env.ANTHROPIC_API_KEY || '',
    enabled: !!env.ANTHROPIC_API_KEY && !env.ANTHROPIC_API_KEY.includes('placeholder'),
  },
  dashscope: {
    apiKey: env.DASHSCOPE_API_KEY || '',
    baseUrl: env.DASHSCOPE_BASE_URL,
    enabled: env.DASHSCOPE_ENABLED === true && !!env.DASHSCOPE_API_KEY,
  },
  deepseek: {
    apiKey: env.DEEPSEEK_API_KEY || '',
    baseUrl: env.DEEPSEEK_BASE_URL,
    enabled: !!env.DEEPSEEK_API_KEY,
  },
  gemini: {
    apiKey: env.GEMINI_API_KEY || '',
    baseUrl: env.GEMINI_BASE_URL,
    enabled: !!env.GEMINI_API_KEY,
  },
  ollama: {
    enabled: env.OLLAMA_ENABLED,
    baseUrl: env.OLLAMA_BASE_URL,
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
  monitoring: {
    sentryDsn: env.SENTRY_DSN,
    sentryEnvironment: env.SENTRY_ENVIRONMENT,
  },
  tracing: {
    otlpEndpoint: env.OTEL_EXPORTER_OTLP_ENDPOINT,
    enabled: env.OTEL_EXPORTER_OTLP_ENDPOINT.length > 0 || env.NODE_ENV === 'development',
  },
  cost: {
    maxTokensPerRequest: env.MAX_TOKENS_PER_REQUEST,
    alertThresholdDaily: env.COST_ALERT_THRESHOLD_DAILY,
  },
} as const;

