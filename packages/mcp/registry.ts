/**
 * MCP Registry - Tool Registration and Discovery
 */

export interface MCPTool {
  name: string;
  description: string;
  version: string;
  params: Record<string, any>;
  permissions: string[];
}

export class MCPRegistry {
  private tools: Map<string, MCPTool> = new Map();

  constructor() {
    this.registerDefaultTools();
  }

  /**
   * Register default MCP tools
   */
  private registerDefaultTools(): void {
    // ─── Original 5 tools ───────────────────────────────────────────────

    this.register({
      name: 'figma',
      description: 'Extract designs from Figma',
      version: '1.0.0',
      params: {
        fileId: 'string',
        token: 'string',
      },
      permissions: ['network'],
    });

    this.register({
      name: 'notion',
      description: 'Fetch content from Notion',
      version: '1.0.0',
      params: {
        pageId: 'string',
        token: 'string',
      },
      permissions: ['network'],
    });

    this.register({
      name: 'playwright',
      description: 'Run E2E tests with Playwright',
      version: '1.0.0',
      params: {
        testPath: 'string',
      },
      permissions: ['network', 'filesystem'],
    });

    this.register({
      name: 'cloudflare',
      description: 'Deploy to Cloudflare Pages',
      version: '1.0.0',
      params: {
        projectName: 'string',
        apiToken: 'string',
        files: 'object',
      },
      permissions: ['network'],
    });

    this.register({
      name: 'replicate',
      description: 'Generate media with Replicate',
      version: '1.0.0',
      params: {
        model: 'string',
        input: 'object',
      },
      permissions: ['network'],
    });

    // ─── 8 new tools ────────────────────────────────────────────────────

    this.register({
      name: 'supabase',
      description: 'Manage Supabase projects, query databases, and generate TypeScript types',
      version: '1.0.0',
      params: {
        action: 'string',
        projectRef: 'string',
        name: 'string',
        region: 'string',
        sql: 'string',
      },
      permissions: ['network', 'read', 'write'],
    });

    this.register({
      name: 'prisma',
      description: 'Introspect DB schemas, generate Prisma client code, and manage migrations',
      version: '1.0.0',
      params: {
        action: 'string',
        connectionString: 'string',
        schema: 'string',
        migrationName: 'string',
      },
      permissions: ['read', 'execute'],
    });

    this.register({
      name: 'github',
      description: 'Manage repositories, files, issues, and code search on GitHub',
      version: '1.0.0',
      params: {
        action: 'string',
        name: 'string',
        org: 'string',
        private: 'boolean',
        owner: 'string',
        repo: 'string',
        path: 'string',
        title: 'string',
        body: 'string',
        query: 'string',
        language: 'string',
      },
      permissions: ['network', 'read', 'write'],
    });

    this.register({
      name: 'slack',
      description: 'Send messages, list channels, fetch history, and upload files to Slack',
      version: '1.0.0',
      params: {
        action: 'string',
        channel: 'string',
        text: 'string',
        limit: 'number',
        filePath: 'string',
        comment: 'string',
      },
      permissions: ['network', 'read', 'write'],
    });

    this.register({
      name: 'websearch',
      description: 'Search the web, get news, docs, and StackOverflow answers',
      version: '1.0.0',
      params: {
        action: 'string',
        query: 'string',
        topic: 'string',
        library: 'string',
        numResults: 'number',
      },
      permissions: ['network', 'read'],
    });

    this.register({
      name: 'prometheus',
      description: 'Execute PromQL queries, list metrics, get alerts, and inspect scrape targets',
      version: '1.0.0',
      params: {
        action: 'string',
        promql: 'string',
        start: 'string',
        end: 'string',
        step: 'string',
      },
      permissions: ['network', 'read'],
    });

    this.register({
      name: 'vercel',
      description: 'Deploy projects, manage deployments, and create Vercel projects',
      version: '1.0.0',
      params: {
        action: 'string',
        projectName: 'string',
        projectId: 'string',
        deploymentId: 'string',
        files: 'object',
        framework: 'string',
      },
      permissions: ['network', 'read', 'write'],
    });
  }

  /**
   * Register a new tool
   */
  register(tool: MCPTool): void {
    this.tools.set(tool.name, tool);
  }

  /**
   * Get tool by name
   */
  get(name: string): MCPTool | undefined {
    return this.tools.get(name);
  }

  /**
   * List all tools
   */
  list(): MCPTool[] {
    return Array.from(this.tools.values());
  }

  /**
   * Check if tool exists
   */
  has(name: string): boolean {
    return this.tools.has(name);
  }
}
