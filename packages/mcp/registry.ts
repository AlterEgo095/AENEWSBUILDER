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
