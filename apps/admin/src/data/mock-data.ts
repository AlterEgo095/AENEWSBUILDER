/**
 * Mock Data for Admin Pages
 * Realistic sample data for development without API backend.
 */

import type {
  MCPToolInfo,
  MCPCategory,
  DashboardStats,
  Project,
  Job,
  User,
  SystemHealth,
  MetricPoint,
  ResourceMetrics,
  LogEvent,
  CostSummary,
  CostByCategory,
  CostByModel,
  DailyCostPoint,
  CostByUser,
  PlatformSettings,
  QueueStats,
  AIModel,
  JobState,
  ProjectStatus,
} from '../types';

// ─── Helper ──────────────────────────────────────────────────────────────────

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString();
}

function hoursAgo(n: number): string {
  const d = new Date();
  d.setHours(d.getHours() - n);
  return d.toISOString();
}

function minutesAgo(n: number): string {
  const d = new Date();
  d.setMinutes(d.getMinutes() - n);
  return d.toISOString();
}

// ─── MCP Tools ───────────────────────────────────────────────────────────────

export const mockMCPTools: MCPToolInfo[] = [
  // Database
  { id: 'supabase', name: 'Supabase (Official)', category: 'database', description: 'Official Supabase MCP server — database, auth, storage, and edge functions', status: 'active', enabled: true, invocations: 12453, successRate: 99.2, avgLatency: 142, envVars: ['SUPABASE_ACCESS_TOKEN', 'SUPABASE_PROJECT_ID'], tags: ['supabase', 'postgresql', 'auth'], author: 'supabase-community', version: '2.1.0', source: { type: 'github', package: 'supabase-community/mcp-server-supabase-official' } },
  { id: 'prisma', name: 'Prisma', category: 'database', description: 'Prisma — database ORM operations, schema management, and migrations', status: 'active', enabled: true, invocations: 8932, successRate: 98.7, avgLatency: 89, envVars: ['DATABASE_URL'], tags: ['prisma', 'orm', 'postgresql'], author: 'prisma', version: '1.2.0', source: { type: 'npm', package: '@prisma/mcp-server' } },
  { id: 'redis', name: 'Redis', category: 'database', description: 'Redis — key-value operations, caching, pub/sub, and data structures', status: 'active', enabled: true, invocations: 15678, successRate: 99.8, avgLatency: 12, envVars: ['REDIS_URL', 'REDIS_PASSWORD'], tags: ['redis', 'key-value', 'cache'], author: 'redis', version: '1.0.0', source: { type: 'npm', package: 'redis-mcp' } },
  { id: 'mongodb', name: 'MongoDB', category: 'database', description: 'MongoDB — CRUD operations, aggregation pipelines, index management', status: 'configured', enabled: false, invocations: 3241, successRate: 97.4, avgLatency: 203, envVars: ['MONGODB_URI', 'MONGODB_DATABASE'], tags: ['mongodb', 'nosql', 'document'], author: 'furey', version: '1.0.0', source: { type: 'github', package: 'furey/mcp-server-mongodb' } },
  { id: 'clickhouse', name: 'ClickHouse', category: 'database', description: 'ClickHouse analytical database — fast OLAP queries and management', status: 'active', enabled: true, invocations: 5621, successRate: 99.1, avgLatency: 167, envVars: ['CLICKHOUSE_HOST', 'CLICKHOUSE_PORT', 'CLICKHOUSE_USER', 'CLICKHOUSE_PASSWORD'], tags: ['clickhouse', 'olap', 'analytics'], author: 'ClickHouse', version: '1.0.0', source: { type: 'github', package: 'ClickHouse/mcp-clickhouse' } },
  { id: 'neon', name: 'Neon', category: 'database', description: 'Neon Serverless Postgres — branching, scale-to-zero, serverless queries', status: 'available', enabled: false, invocations: 0, successRate: 0, avgLatency: 0, envVars: ['NEON_CONNECTION_STRING', 'NEON_API_KEY'], tags: ['neon', 'serverless', 'postgresql'], author: 'neondatabase', version: '1.0.0', source: { type: 'github', package: 'neondatabase/mcp-server-neon' } },
  { id: 'qdrant', name: 'Qdrant', category: 'database', description: 'Qdrant — high-performance vector similarity search and storage', status: 'active', enabled: true, invocations: 7823, successRate: 99.5, avgLatency: 45, envVars: ['QDRANT_URL', 'QDRANT_API_KEY'], tags: ['qdrant', 'vector-store', 'embeddings'], author: 'qdrant', version: '1.0.0', source: { type: 'npm', package: 'qdrant-mcp' } },

  // Cloud
  { id: 'aws', name: 'AWS', category: 'cloud', description: 'AWS services — manage EC2, S3, Lambda, IAM, and more via AWS SDK', status: 'active', enabled: true, invocations: 9234, successRate: 98.9, avgLatency: 312, envVars: ['AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'AWS_REGION'], tags: ['aws', 'ec2', 's3', 'lambda'], author: 'awslabs', version: '1.0.0', source: { type: 'github', package: 'awslabs/mcp' } },
  { id: 'cloudflare', name: 'Cloudflare', category: 'cloud', description: 'Cloudflare — Workers, KV, R2, D1, Pages, and DNS management', status: 'active', enabled: true, invocations: 6543, successRate: 99.3, avgLatency: 78, envVars: ['CLOUDFLARE_ACCOUNT_ID', 'CLOUDFLARE_API_TOKEN'], tags: ['cloudflare', 'workers', 'dns', 'cdn'], author: 'cloudflare', version: '1.0.0', source: { type: 'npm', package: 'cloudflare-mcp' } },
  { id: 'vercel', name: 'Vercel', category: 'cloud', description: 'Vercel — deployments, edge functions, domains, and project management', status: 'active', enabled: true, invocations: 11234, successRate: 99.6, avgLatency: 156, envVars: ['VERCEL_TOKEN'], tags: ['vercel', 'deployments', 'edge'], author: 'vercel', version: '1.0.0', source: { type: 'npm', package: 'vercel-mcp' } },
  { id: 'kubernetes', name: 'Kubernetes', category: 'cloud', description: 'Kubernetes — manage pods, deployments, services, and cluster resources', status: 'configured', enabled: false, invocations: 0, successRate: 0, avgLatency: 0, envVars: ['KUBECONFIG', 'KUBERNETES_NAMESPACE'], tags: ['kubernetes', 'k8s', 'containers'], author: 'reza-gholizade', version: '1.0.0', source: { type: 'github', package: 'reza-gholizade/mcp-k8s' } },
  { id: 'terraform', name: 'Terraform', category: 'cloud', description: 'Terraform — plan, apply, and manage infrastructure as code', status: 'active', enabled: true, invocations: 2341, successRate: 97.8, avgLatency: 4521, envVars: ['TF_TOKEN_app_terraform_io'], tags: ['terraform', 'iac', 'infrastructure'], author: 'nwiizo', version: '1.0.0', source: { type: 'github', package: 'nwiizo/tfmcp' } },

  // Browser
  { id: 'playwright', name: 'Playwright', category: 'browser', description: 'Playwright — browser automation, screenshots, navigation, and form filling', status: 'active', enabled: true, invocations: 14567, successRate: 98.1, avgLatency: 1234, envVars: [], tags: ['playwright', 'browser', 'automation'], author: 'Automata-Labs', version: '1.0.0', source: { type: 'npm', package: 'playwright-mcp' } },
  { id: 'browserbase', name: 'Browserbase', category: 'browser', description: 'Browserbase — cloud browser automation with session management', status: 'configured', enabled: false, invocations: 432, successRate: 96.8, avgLatency: 2341, envVars: ['BROWSERBASE_API_KEY', 'BROWSERBASE_PROJECT_ID'], tags: ['browserbase', 'cloud-browser'], author: 'browserbase', version: '1.0.0', source: { type: 'github', package: 'browserbase/mcp-server-browserbase' } },

  // Communication
  { id: 'slack', name: 'Slack', category: 'communication', description: 'Slack — send messages, list channels, manage conversations and files', status: 'active', enabled: true, invocations: 18923, successRate: 99.7, avgLatency: 234, envVars: ['SLACK_BOT_TOKEN', 'SLACK_TEAM_ID'], tags: ['slack', 'messaging', 'channels'], author: 'modelcontextprotocol', version: '1.0.0', source: { type: 'github', package: 'modelcontextprotocol/server-slack' } },
  { id: 'github', name: 'GitHub', category: 'communication', description: 'GitHub — manage repos, issues, PRs, actions, and code review', status: 'active', enabled: true, invocations: 23456, successRate: 99.4, avgLatency: 345, envVars: ['GITHUB_TOKEN'], tags: ['github', 'repos', 'issues', 'pr'], author: 'github', version: '1.0.0', source: { type: 'npm', package: 'github-mcp' } },
  { id: 'gmail', name: 'Gmail', category: 'communication', description: 'Gmail — read, send, and manage emails with AI-powered triage', status: 'active', enabled: true, invocations: 6789, successRate: 99.1, avgLatency: 567, envVars: ['GMAIL_CLIENT_ID', 'GMAIL_CLIENT_SECRET', 'GMAIL_REFRESH_TOKEN'], tags: ['gmail', 'email', 'inbox'], author: 'elie222', version: '1.0.0', source: { type: 'github', package: 'elie222/mcp-inbox-zero' } },
  { id: 'telegram', name: 'Telegram', category: 'communication', description: 'Telegram — send messages, manage channels, and bot interactions', status: 'configured', enabled: false, invocations: 1234, successRate: 98.5, avgLatency: 89, envVars: ['TELEGRAM_BOT_TOKEN'], tags: ['telegram', 'messaging', 'bot'], author: 'chaindead', version: '1.0.0', source: { type: 'github', package: 'chaindead/mcp-telegram' } },

  // Code
  { id: 'pydantic-ai', name: 'Pydantic AI', category: 'code', description: 'Pydantic AI — Python sandbox execution with type-safe AI tool calls', status: 'active', enabled: true, invocations: 7823, successRate: 97.6, avgLatency: 890, envVars: ['OPENAI_API_KEY'], tags: ['python', 'sandbox', 'ai'], author: 'pydantic', version: '1.0.0', source: { type: 'npm', package: 'pydantic-ai-mcp' } },
  { id: 'node-sandbox', name: 'Node Code Sandbox', category: 'code', description: 'Node.js sandbox — execute JavaScript with npm package support', status: 'active', enabled: true, invocations: 5678, successRate: 98.2, avgLatency: 456, envVars: [], tags: ['node', 'javascript', 'sandbox'], author: 'alfonsograziano', version: '1.0.0', source: { type: 'github', package: 'alfonsograziano/node-code-sandbox-mcp' } },

  // Search
  { id: 'tavily', name: 'Tavily Search', category: 'search', description: 'Tavily — AI-optimized web search with real-time results and citations', status: 'active', enabled: true, invocations: 19876, successRate: 99.8, avgLatency: 789, envVars: ['TAVILY_API_KEY'], tags: ['search', 'web', 'ai'], author: 'tavily', version: '1.0.0', source: { type: 'npm', package: 'tavily-mcp' } },
  { id: 'brave-search', name: 'Brave Search', category: 'search', description: 'Brave Search — private web search with summarized results', status: 'active', enabled: true, invocations: 8765, successRate: 99.3, avgLatency: 678, envVars: ['BRAVE_API_KEY'], tags: ['brave', 'search', 'privacy'], author: 'brave', version: '1.0.0', source: { type: 'npm', package: 'brave-search-mcp' } },

  // Multimedia
  { id: 'replicate', name: 'Replicate', category: 'multimedia', description: 'Replicate — run AI models for image, audio, video generation', status: 'active', enabled: true, invocations: 4567, successRate: 97.8, avgLatency: 3456, envVars: ['REPLICATE_API_TOKEN'], tags: ['replicate', 'ai', 'generation'], author: 'replicate', version: '1.0.0', source: { type: 'npm', package: 'replicate-mcp' } },
  { id: 'ffmpeg', name: 'FFmpeg', category: 'multimedia', description: 'FFmpeg — video and audio processing, transcoding, and manipulation', status: 'active', enabled: true, invocations: 3456, successRate: 98.9, avgLatency: 2345, envVars: [], tags: ['ffmpeg', 'video', 'audio', 'processing'], author: 'community', version: '1.0.0', source: { type: 'github', package: 'community/ffmpeg-mcp' } },

  // Monitoring
  { id: 'prometheus', name: 'Prometheus', category: 'monitoring', description: 'Prometheus — query metrics, manage alerts, and monitor systems', status: 'active', enabled: true, invocations: 6543, successRate: 99.6, avgLatency: 123, envVars: ['PROMETHEUS_URL'], tags: ['prometheus', 'metrics', 'monitoring'], author: 'prometheus', version: '1.0.0', source: { type: 'npm', package: 'prometheus-mcp' } },
  { id: 'grafana', name: 'Grafana', category: 'monitoring', description: 'Grafana — manage dashboards, query data sources, annotations', status: 'configured', enabled: false, invocations: 0, successRate: 0, avgLatency: 0, envVars: ['GRAFANA_URL', 'GRAFANA_TOKEN'], tags: ['grafana', 'dashboards', 'visualization'], author: 'grafana', version: '1.0.0', source: { type: 'npm', package: 'grafana-mcp' } },

  // Tools
  { id: 'notion', name: 'Notion', category: 'tools', description: 'Notion — manage pages, databases, and content in Notion workspaces', status: 'active', enabled: true, invocations: 8765, successRate: 99.1, avgLatency: 567, envVars: ['NOTION_TOKEN'], tags: ['notion', 'wiki', 'knowledge'], author: 'makenotion', version: '1.0.0', source: { type: 'npm', package: 'notion-mcp' } },
  { id: 'figma', name: 'Figma', category: 'tools', description: 'Figma — read designs, components, and design tokens from Figma files', status: 'active', enabled: true, invocations: 4321, successRate: 98.4, avgLatency: 890, envVars: ['FIGMA_ACCESS_TOKEN'], tags: ['figma', 'design', 'ui'], author: 'figma', version: '1.0.0', source: { type: 'npm', package: 'figma-mcp' } },
  { id: 'linear', name: 'Linear', category: 'tools', description: 'Linear — manage projects, issues, and cycles in Linear', status: 'configured', enabled: false, invocations: 0, successRate: 0, avgLatency: 0, envVars: ['LINEAR_API_KEY'], tags: ['linear', 'project-management', 'issues'], author: 'linear', version: '1.0.0', source: { type: 'npm', package: 'linear-mcp' } },

  // File
  { id: 'google-drive', name: 'Google Drive', category: 'file', description: 'Google Drive — upload, download, search, and manage files', status: 'active', enabled: true, invocations: 3456, successRate: 98.7, avgLatency: 678, envVars: ['GOOGLE_DRIVE_CLIENT_ID', 'GOOGLE_DRIVE_CLIENT_SECRET'], tags: ['google-drive', 'storage', 'files'], author: 'google', version: '1.0.0', source: { type: 'npm', package: 'google-drive-mcp' } },
  { id: 's3', name: 'AWS S3', category: 'file', description: 'AWS S3 — upload, download, and manage objects in S3 buckets', status: 'active', enabled: true, invocations: 7654, successRate: 99.5, avgLatency: 234, envVars: ['AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY'], tags: ['s3', 'storage', 'objects'], author: 'aws', version: '1.0.0', source: { type: 'npm', package: 's3-mcp' } },

  // Security
  { id: 'trufflehog', name: 'TruffleHog', category: 'security', description: 'TruffleHog — scan for secrets, API keys, and credentials in code', status: 'active', enabled: true, invocations: 5678, successRate: 99.9, avgLatency: 2345, envVars: [], tags: ['security', 'secrets', 'scanning'], author: 'trufflesecurity', version: '1.0.0', source: { type: 'npm', package: 'trufflehog-mcp' } },
  { id: 'owasp', name: 'OWASP ZAP', category: 'security', description: 'OWASP ZAP — automated security scanning and vulnerability detection', status: 'available', enabled: false, invocations: 0, successRate: 0, avgLatency: 0, envVars: ['ZAP_API_KEY', 'ZAP_URL'], tags: ['owasp', 'security', 'vulnerability'], author: 'owasp', version: '1.0.0', source: { type: 'github', package: 'owasp/zap-mcp' } },

  // Translation
  { id: 'deepl', name: 'DeepL', category: 'translation', description: 'DeepL — high-quality translation with context awareness', status: 'active', enabled: true, invocations: 3456, successRate: 99.4, avgLatency: 345, envVars: ['DEEPL_API_KEY'], tags: ['deepl', 'translation', 'language'], author: 'deepl', version: '1.0.0', source: { type: 'npm', package: 'deepl-mcp' } },

  // Social
  { id: 'twitter', name: 'Twitter / X', category: 'social', description: 'Twitter/X — search tweets, timelines, and user profiles', status: 'configured', enabled: false, invocations: 1234, successRate: 95.2, avgLatency: 789, envVars: ['TWITTER_USERNAME', 'TWITTER_PASSWORD'], tags: ['twitter', 'x', 'social-media'], author: 'adhikasp', version: '1.0.0', source: { type: 'github', package: 'adhikasp/mcp-twikit' } },
];

// ─── Dashboard Stats ─────────────────────────────────────────────────────────

export const mockDashboardStats: DashboardStats = {
  totalProjects: 347,
  activeJobs: 23,
  totalUsers: 89,
  mcpToolsAvailable: 162,
  successRate: 98.4,
  avgBuildTime: 142000,
  projectsToday: 12,
  costsToday: 127.45,
};

// ─── Projects ────────────────────────────────────────────────────────────────

const projectNames = [
  'E-Commerce Platform', 'SaaS Dashboard', 'AI Chat Interface', 'Portfolio Website',
  'Blog Engine', 'Task Management App', 'Real-time Chat', 'Data Visualization Portal',
  'Admin Panel', 'Landing Page', 'Mobile App Backend', 'API Gateway',
  'Microservices Hub', 'Social Media Dashboard', 'Inventory System',
];

const userNames = [
  { name: 'Sarah Chen', email: 'sarah.chen@company.com' },
  { name: 'Marcus Johnson', email: 'marcus.j@startup.io' },
  { name: 'Elena Rodriguez', email: 'elena.r@design.co' },
  { name: 'James Wilson', email: 'jwilson@tech.dev' },
  { name: 'Aisha Patel', email: 'aisha.p@venture.ai' },
  { name: 'Tom Anderson', email: 'tom.a@agency.com' },
  { name: 'Yuki Tanaka', email: 'yuki.t@global.jp' },
  { name: 'Lisa Park', email: 'lisa.park@studio.kr' },
  { name: 'David Kim', email: 'dkim@enterprise.com' },
  { name: 'Nina Volkov', email: 'nina.v@cloudlab.ru' },
];

const aiModels: AIModel[] = ['gpt-4o', 'gpt-4o-mini', 'claude-sonnet-4', 'claude-haiku-3.5', 'gemini-pro', 'deepseek-v3'];
const projectStatuses: ProjectStatus[] = ['active', 'building', 'deployed', 'failed', 'archived'];

export const mockProjects: Project[] = Array.from({ length: 15 }, (_, i) => ({
  id: `proj-${String(i + 1).padStart(4, '0')}`,
  name: projectNames[i],
  user: userNames[i % userNames.length].name,
  userEmail: userNames[i % userNames.length].email,
  status: projectStatuses[i % projectStatuses.length],
  cost: Math.round((Math.random() * 200 + 5) * 100) / 100,
  files: Math.floor(Math.random() * 45 + 5),
  aiModel: aiModels[i % aiModels.length],
  createdAt: daysAgo(Math.floor(Math.random() * 30 + 1)),
  lastDeployedAt: i % 3 === 0 ? null : daysAgo(Math.floor(Math.random() * 7)),
  url: i % 3 === 0 ? null : `https://${projectNames[i].toLowerCase().replace(/\s+/g, '-')}.aenews.dev`,
})).sort((a, b) => b.cost - a.cost);

// ─── Jobs ────────────────────────────────────────────────────────────────────

const jobTypes = ['generate', 'deploy', 'analyze', 'test', 'build', 'mcp-execute'];
const jobStates: JobState[] = ['waiting', 'active', 'completed', 'failed', 'stalled', 'delayed'];

export const mockJobs: Job[] = Array.from({ length: 20 }, (_, i) => ({
  id: `job-${String(i + 1).padStart(5, '0')}`,
  projectId: `proj-${String(Math.floor(Math.random() * 15 + 1)).padStart(4, '0')}`,
  projectName: projectNames[Math.floor(Math.random() * projectNames.length)],
  state: jobStates[i % jobStates.length],
  progress: Math.floor(Math.random() * 100),
  elapsed: Math.floor(Math.random() * 600 + 10),
  startedAt: minutesAgo(Math.floor(Math.random() * 120 + 5)),
  type: jobTypes[Math.floor(Math.random() * jobTypes.length)],
  workerId: `worker-${Math.floor(Math.random() * 5 + 1)}`,
}));

// ─── Users ───────────────────────────────────────────────────────────────────

const roles: ('admin' | 'user' | 'viewer')[] = ['admin', 'user', 'user', 'user', 'user', 'user', 'user', 'viewer', 'viewer', 'viewer'];

export const mockUsers: User[] = userNames.map((u, i) => ({
  id: `user-${String(i + 1).padStart(4, '0')}`,
  name: u.name,
  email: u.email,
  role: roles[i],
  projectsCount: Math.floor(Math.random() * 12 + 1),
  totalCost: Math.round((Math.random() * 500 + 10) * 100) / 100,
  lastActive: hoursAgo(Math.floor(Math.random() * 72 + 1)),
  avatar: null,
  createdAt: daysAgo(Math.floor(Math.random() * 90 + 10)),
}));

// ─── Health Data ─────────────────────────────────────────────────────────────

export const mockHealthData: SystemHealth = {
  api: { status: 'up', latency: 45, uptime: '99.97%' },
  postgresql: { status: 'up', connections: 12, maxConnections: 100, poolUsage: 0.12 },
  redis: { status: 'up', memoryUsage: 256, maxMemory: 1024, hitRate: 94.3 },
  bullmq: { active: 5, waiting: 18, completed: 15423, failed: 42, delayed: 3 },
};

// ─── Resource Metrics ────────────────────────────────────────────────────────

function generateMetricPoints(count: number, min: number, max: number): MetricPoint[] {
  return Array.from({ length: count }, (_, i) => ({
    time: minutesAgo((count - 1 - i) * 2),
    value: Math.round((Math.random() * (max - min) + min) * 10) / 10,
  }));
}

export const mockResourceMetrics: ResourceMetrics = {
  memory: generateMetricPoints(30, 2.1, 4.8),
  cpu: generateMetricPoints(30, 5, 67),
  queueThroughput: generateMetricPoints(30, 8, 45),
  responseTime: Array.from({ length: 30 }, (_, i) => ({
    time: minutesAgo((29 - i) * 2),
    p50: Math.round(Math.random() * 80 + 30),
    p95: Math.round(Math.random() * 200 + 150),
    p99: Math.round(Math.random() * 400 + 300),
  })),
};

// ─── Log Events ──────────────────────────────────────────────────────────────

const logSources = ['api', 'queue', 'worker-1', 'worker-2', 'worker-3', 'mcp-executor', 'deployer', 'generator', 'cost-tracker', 'auto-healing'];
const logMessages: Record<string, string[]> = {
  info: [
    'Project proj-0042 generation started',
    'MCP tool slack:invoke completed in 234ms',
    'Queue worker-2 processed job job-00123 successfully',
    'New user registered: lisa.park@studio.kr',
    'Deployment completed for E-Commerce Platform',
    'Health check passed — all systems nominal',
    'Cache invalidated for project proj-0015',
    'WebSocket connection established from 192.168.1.42',
    'Sandbox warm pool refreshed — 5 instances ready',
    'Cost tracker recorded $2.34 for generation job',
  ],
  warn: [
    'Queue depth exceeding threshold: 45 jobs waiting',
    'Worker worker-3 memory usage at 87%',
    'MCP tool browserbase timeout after 30000ms',
    'Rate limit approaching for user marcus.j@startup.io (85%)',
    'Slow query detected: 4.2s on projects table',
    'Circuit breaker half-open for claude-sonnet-4 (3/5 failures)',
    'Disk usage at 78% on volume /data',
  ],
  error: [
    'Failed to deploy project proj-0078: Build timeout after 120s',
    'MCP tool aws:s3-upload failed: AccessDenied',
    'Database connection pool exhausted — 100/100 connections',
    'Job job-00456 stalled — no heartbeat for 60s',
    'AI failover triggered: GPT-4o unavailable, switching to Claude',
    'Sandbox container crash detected — restarting',
  ],
};

function generateLogEvents(count: number): LogEvent[] {
  const levels: Array<'info' | 'warn' | 'error'> = ['info', 'info', 'info', 'info', 'info', 'warn', 'warn', 'error'];
  return Array.from({ length: count }, (_, i) => {
    const level = levels[Math.floor(Math.random() * levels.length)];
    const msgs = logMessages[level];
    return {
      id: `log-${String(count - i).padStart(5, '0')}`,
      timestamp: minutesAgo(Math.floor(Math.random() * 30)),
      level,
      source: logSources[Math.floor(Math.random() * logSources.length)],
      message: msgs[Math.floor(Math.random() * msgs.length)],
    };
  });
}

export const mockLogEvents: LogEvent[] = generateLogEvents(50);

// ─── Cost Data ───────────────────────────────────────────────────────────────

export const mockCostSummary: CostSummary = {
  totalThisMonth: 4287.53,
  avgPerProject: 12.36,
  mostExpensiveProject: { name: 'E-Commerce Platform', cost: 187.42 },
  dailyAverage: 142.92,
  trend: 12.3,
  dailyBudget: { used: 127.45, limit: 200 },
  monthlyBudget: { used: 4287.53, limit: 5000 },
};

function generateDailyCosts(days: number): DailyCostPoint[] {
  return Array.from({ length: days }, (_, i) => ({
    date: new Date(Date.now() - (days - 1 - i) * 86400000).toISOString().split('T')[0],
    cost: Math.round((Math.random() * 80 + 90) * 100) / 100,
  }));
}

export const mockDailyCosts: DailyCostPoint[] = generateDailyCosts(30);

export const mockCostByCategory: CostByCategory[] = [
  { category: 'AI Generation', cost: 2145.30, color: '#3b82f6' },
  { category: 'AI Analysis', cost: 892.15, color: '#8b5cf6' },
  { category: 'Deployment', cost: 534.20, color: '#10b981' },
  { category: 'MCP Execution', cost: 423.88, color: '#f59e0b' },
  { category: 'Security Scans', cost: 192.00, color: '#ef4444' },
  { category: 'Storage', cost: 100.00, color: '#06b6d4' },
];

export const mockCostByModel: CostByModel[] = [
  { model: 'GPT-4o', cost: 1890.45, percentage: 44.1, color: '#3b82f6' },
  { model: 'Claude Sonnet 4', cost: 1234.56, percentage: 28.8, color: '#8b5cf6' },
  { model: 'GPT-4o Mini', cost: 678.90, percentage: 15.8, color: '#10b981' },
  { model: 'Claude Haiku 3.5', cost: 312.34, percentage: 7.3, color: '#f59e0b' },
  { model: 'Gemini Pro', cost: 112.28, percentage: 2.6, color: '#ef4444' },
  { model: 'DeepSeek V3', cost: 59.00, percentage: 1.4, color: '#06b6d4' },
];

export const mockCostByUser: CostByUser[] = userNames
  .map((u) => ({
    user: u.name,
    email: u.email,
    cost: Math.round((Math.random() * 800 + 50) * 100) / 100,
  }))
  .sort((a, b) => b.cost - a.cost);

// ─── Queue Stats ─────────────────────────────────────────────────────────────

export const mockQueueStats: QueueStats = {
  active: 5,
  waiting: 18,
  completed: 15423,
  failed: 42,
  delayed: 3,
  totalProcessed: 15465,
  throughputPerMinute: 12.4,
};

// ─── Settings ────────────────────────────────────────────────────────────────

export const mockSettings: PlatformSettings = {
  general: {
    platformName: 'AENEWS Builder',
    platformUrl: 'https://aenews.dev',
    maintenanceMode: false,
    registrationOpen: true,
    defaultUserRole: 'user',
  },
  ai: {
    openaiApiKey: 'sk-proj-xxxxxxxxxxxxxxxxxxxx',
    anthropicApiKey: 'sk-ant-xxxxxxxxxxxxxxxxxxxx',
    defaultModel: 'claude-sonnet-4',
    maxTokens: 8192,
    temperature: 0.7,
    dailyBudgetLimit: 200,
    hourlyBudgetLimit: 30,
    circuitBreakerEnabled: true,
    circuitBreakerThreshold: 5,
  },
  security: {
    jwtExpiry: '24h',
    rateLimitMax: 100,
    rateLimitWindow: '5min',
    ipBanThreshold: 50,
    cspEnabled: true,
    corsOrigins: ['https://aenews.dev', 'https://studio.aenews.dev', 'http://localhost:3000'],
  },
  mcp: {
    registrySecret: 'mcp-reg-xxxxxxxxxxxxxxxxxxxx',
    defaultTimeout: 30,
    maxConcurrentExecutions: 10,
    perToolRateLimits: [
      { tool: 'playwright', limit: 20, window: '1min' },
      { tool: 'replicate', limit: 10, window: '1min' },
      { tool: 'aws', limit: 50, window: '1min' },
    ],
  },
  queue: {
    workerConcurrency: 5,
    jobTimeout: 300,
    maxRetryAttempts: 3,
    dlqEnabled: true,
    stalledJobTimeout: 120,
  },
  notifications: {
    errorNotifications: true,
    deploymentNotifications: true,
    costThresholdAlert: 150,
    slackWebhookUrl: 'https://hooks.slack.com/services/T00/B00/xxx',
    emailNotifications: false,
  },
};
