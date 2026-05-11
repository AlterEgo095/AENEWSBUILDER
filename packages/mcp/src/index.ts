/**
 * @aenews/mcp - MCP Tools Entry Point
 * Re-exports all MCP modules for unified access
 */

export { MCPAdapter, type MCPExecutionResult } from '../adapter.js';
export { MCPRegistry } from '../registry.js';
export { logger } from '../adapter.js';

// Tool adapters
export { default as FigmaAdapter } from '../tools/figma.js';
export { default as NotionAdapter } from '../tools/notion.js';
export { default as PlaywrightAdapter } from '../tools/playwright.js';
export { default as ReplicateAdapter } from '../tools/replicate.js';
export { default as DeployAdapter } from '../tools/deploy.js';

// New tool adapters
export { default as SupabaseAdapter } from '../tools/supabase.js';
export { default as PrismaAdapter } from '../tools/prisma.js';
export { default as GitHubAdapter } from '../tools/github.js';
export { default as SlackAdapter } from '../tools/slack.js';
export { default as WebSearchAdapter } from '../tools/websearch.js';
export { default as PrometheusAdapter } from '../tools/prometheus.js';
export { default as VercelAdapter } from '../tools/vercel.js';

// Security (decoupled metrics)
export { setMetricsProvider } from '../security.js';
