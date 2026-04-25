/**
 * MCP Adapter - Universal Tool Execution Interface
 */

import { logger } from '../config/logger.js';
import { MCPRegistry } from './registry.js';
import { spawn } from 'child_process';

export interface MCPExecutionResult {
  success: boolean;
  data?: any;
  error?: string;
  duration: number;
}

export class MCPAdapter {
  private registry: MCPRegistry;

  constructor() {
    this.registry = new MCPRegistry();
  }

  /**
   * Execute MCP tool in isolated container
   */
  async execute(toolName: string, params: Record<string, any>): Promise<MCPExecutionResult> {
    const startTime = Date.now();

    try {
      const tool = this.registry.get(toolName);
      
      if (!tool) {
        throw new Error(`Tool not found: ${toolName}`);
      }

      logger.info({ toolName, params }, '🔌 Executing MCP tool');

      // Execute in Docker container
      const result = await this.executeInContainer(tool, params);

      return {
        success: true,
        data: result,
        duration: Date.now() - startTime,
      };

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
   * Execute multiple tools in parallel
   */
  async executeParallel(tools: Array<{ name: string; params: Record<string, any> }>): Promise<MCPExecutionResult[]> {
    const promises = tools.map((tool) => this.execute(tool.name, tool.params));
    return Promise.all(promises);
  }
}
