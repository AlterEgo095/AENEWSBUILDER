/**
 * MCP Adapter - Universal Tool Execution Interface
 *
 * Primary path: Docker container isolation
 * Fallback: Direct tool adapter execution when Docker images don't exist
 */

import pino from 'pino';

export const logger = pino({ name: '@aenews/mcp' });
import { MCPRegistry } from './registry.js';
import { spawn } from 'child_process';

// Direct tool adapter imports for fallback execution
import FigmaAdapter from './tools/figma.js';
import NotionAdapter from './tools/notion.js';
import PlaywrightAdapter from './tools/playwright.js';
import ReplicateAdapter from './tools/replicate.js';
import DeployAdapter from './tools/deploy.js';
import SupabaseAdapter from './tools/supabase.js';
import PrismaAdapter from './tools/prisma.js';
import GitHubAdapter from './tools/github.js';
import SlackAdapter from './tools/slack.js';
import WebSearchAdapter from './tools/websearch.js';
import PrometheusAdapter from './tools/prometheus.js';
import VercelAdapter from './tools/vercel.js';

export interface MCPExecutionResult {
  success: boolean;
  data?: any;
  error?: string;
  duration: number;
}

/**
 * Map of tool names to their direct adapter constructors.
 * Used as fallback when Docker container execution fails (e.g. image not found).
 */
const DIRECT_ADAPTER_MAP: Record<string, any> = {
  figma: FigmaAdapter,
  notion: NotionAdapter,
  playwright: PlaywrightAdapter,
  replicate: ReplicateAdapter,
  deploy: DeployAdapter,
  supabase: SupabaseAdapter,
  prisma: PrismaAdapter,
  github: GitHubAdapter,
  slack: SlackAdapter,
  websearch: WebSearchAdapter,
  prometheus: PrometheusAdapter,
  vercel: VercelAdapter,
};

export class MCPAdapter {
  private registry: MCPRegistry;

  constructor() {
    this.registry = new MCPRegistry();
  }

  /**
   * Execute MCP tool — tries Docker container first, falls back to direct adapter
   */
  async execute(toolName: string, params: Record<string, any>): Promise<MCPExecutionResult> {
    const startTime = Date.now();

    try {
      const tool = this.registry.get(toolName);

      if (!tool) {
        throw new Error(`Tool not found: ${toolName}`);
      }

      logger.info({ toolName, params }, '🔌 Executing MCP tool');

      // Try Docker container execution first
      try {
        const result = await this.executeInContainer(tool, params);

        return {
          success: true,
          data: result,
          duration: Date.now() - startTime,
        };
      } catch (containerError: any) {
        // If Docker container failed (e.g. image not found), fall back to direct adapter
        logger.warn(
          { toolName, containerError: containerError.message },
          '🔌 Docker container execution failed, falling back to direct adapter',
        );

        const directResult = await this.executeDirectAdapter(toolName, params);

        return {
          success: directResult.success,
          data: directResult.data,
          error: directResult.error,
          duration: Date.now() - startTime,
        };
      }

    } catch (error: any) {
      logger.error({ error, toolName }, '❌ MCP execution failed');
      return {
        success: false,
        error: error.message,
        duration: Date.now() - startTime,
      };
    }
  }

  /**
   * Execute tool in Docker container with isolation
   */
  private async executeInContainer(tool: any, params: Record<string, any>): Promise<any> {
    return new Promise((resolve, reject) => {
      const docker = spawn('docker', [
        'run',
        '--rm',
        '--network', 'none', // Network isolation
        '--memory', '256m',
        '--cpus', '0.5',
        '-e', `PARAMS=${JSON.stringify(params)}`,
        `aenews/mcp-${tool.name}:latest`,
      ]);

      let output = '';
      let errorOutput = '';

      docker.stdout.on('data', (data) => {
        output += data.toString();
      });

      docker.stderr.on('data', (data) => {
        errorOutput += data.toString();
      });

      docker.on('close', (code) => {
        if (code === 0) {
          try {
            resolve(JSON.parse(output));
          } catch (error) {
            resolve(output);
          }
        } else {
          reject(new Error(errorOutput || 'Container execution failed'));
        }
      });

      // Timeout
      setTimeout(() => {
        docker.kill();
        reject(new Error('MCP execution timeout'));
      }, 30000);
    });
  }

  /**
   * Execute tool directly using the imported adapter (no Docker isolation).
   * This is the fallback path when Docker images don't exist.
   */
  private async executeDirectAdapter(
    toolName: string,
    params: Record<string, any>,
  ): Promise<{ success: boolean; data?: any; error?: string }> {
    const AdapterClass = DIRECT_ADAPTER_MAP[toolName];

    if (!AdapterClass) {
      return {
        success: false,
        error: `No direct adapter available for tool: ${toolName}`,
      };
    }

    try {
      // Instantiate the adapter with env-based credentials
      const adapter = new AdapterClass();
      const result = await adapter.execute(params);

      return {
        success: result.success ?? true,
        data: result.data ?? result,
        error: result.error,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Execute multiple tools in parallel
   */
  async executeParallel(tools: Array<{ name: string; params: Record<string, any> }>): Promise<MCPExecutionResult[]> {
    const promises = tools.map((tool) => this.execute(tool.name, tool.params));
    return Promise.all(promises);
  }
}
