/**
 * Sandbox Manager - Warm Pool for Instant Testing
 */

import { spawn } from 'child_process';
import { logger } from '../config/logger.js';
import { config } from '../config/env.js';
import fs from 'fs/promises';
import path from 'path';

export interface TestResult {
  success: boolean;
  errors: string[];
  output: string;
  duration: number;
}

export class SandboxManager {
  private warmPool: Map<string, string> = new Map();

  constructor() {
    this.initWarmPool();
  }

  /**
   * Initialize warm pool of pre-configured containers
   */
  private async initWarmPool(): Promise<void> {
    const stacks = ['react', 'next', 'express'];
    
    for (const stack of stacks) {
      try {
        const containerId = await this.createContainer(stack);
        this.warmPool.set(stack, containerId);
        logger.info({ stack, containerId }, '✅ Warm container created');
      } catch (error) {
        logger.error({ error, stack }, '❌ Failed to create warm container');
      }
    }
  }

  /**
   * Create Docker container
   */
  private async createContainer(stack: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const docker = spawn('docker', [
        'run',
        '-d',
        '--network', 'none',
        '--memory', config.sandbox.memoryLimit,
        '--cpus', config.sandbox.cpuLimit,
        `aenews/sandbox-${stack}:latest`,
        'tail', '-f', '/dev/null', // Keep container alive
      ]);

      let containerId = '';

      docker.stdout.on('data', (data) => {
        containerId += data.toString();
      });

      docker.on('close', (code) => {
        if (code === 0) {
          resolve(containerId.trim());
        } else {
          reject(new Error(`Docker run failed with code ${code}`));
        }
      });
    });
  }

  /**
   * Run tests in warm sandbox
   */
  async runTests(files: Record<string, string>): Promise<TestResult> {
    const startTime = Date.now();
    const errors: string[] = [];
    let output = '';

    try {
      // Detect stack
      const stack = this.detectStack(files);
      const containerId = this.warmPool.get(stack);

      if (!containerId) {
        throw new Error(`No warm container for stack: ${stack}`);
      }

      logger.info({ stack, containerId }, '🧪 Running tests in sandbox');

      // Copy files to container
      await this.copyFilesToContainer(containerId, files);

      // Run tests
      const testOutput = await this.executeInContainer(containerId, 'npm test');
      output = testOutput;

      // Parse test results
      const success = !testOutput.includes('FAIL') && !testOutput.includes('Error');

      if (!success) {
        errors.push('Tests failed. Check output for details.');
      }

      return {
        success,
        errors,
        output,
        duration: Date.now() - startTime,
      };

    } catch (error: any) {
      logger.error({ error }, '❌ Sandbox test failed');
      return {
        success: false,
        errors: [error.message],
        output,
        duration: Date.now() - startTime,
      };
    }
  }

  /**
   * Detect project stack from files
   */
  private detectStack(files: Record<string, string>): string {
    if (files['next.config.js'] || files['next.config.mjs']) {
      return 'next';
    }
    if (files['package.json']?.includes('react')) {
      return 'react';
    }
    if (files['package.json']?.includes('express')) {
      return 'express';
    }
    return 'react'; // default
  }

  /**
   * Copy files to container
   */
  private async copyFilesToContainer(
    containerId: string,
    files: Record<string, string>
  ): Promise<void> {
    const tempDir = `/tmp/aenews-${Date.now()}`;
    await fs.mkdir(tempDir, { recursive: true });

    try {
      // Write files to temp directory
      for (const [filePath, content] of Object.entries(files)) {
        const fullPath = path.join(tempDir, filePath);
        await fs.mkdir(path.dirname(fullPath), { recursive: true });
        await fs.writeFile(fullPath, content);
      }

      // Copy to container
      await this.execCommand(`docker cp ${tempDir}/. ${containerId}:/app`);

    } finally {
      // Cleanup
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  }

  /**
   * Execute command in container
   */
  private async executeInContainer(containerId: string, command: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const docker = spawn('docker', [
        'exec',
        containerId,
        'sh',
        '-c',
        `cd /app && ${command}`,
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
        const fullOutput = output + errorOutput;
        if (code === 0) {
          resolve(fullOutput);
        } else {
          resolve(fullOutput); // Return output even on error for analysis
        }
      });

      // Timeout
      setTimeout(() => {
        docker.kill();
        reject(new Error('Sandbox execution timeout'));
      }, config.sandbox.timeout);
    });
  }

  /**
   * Execute shell command
   */
  private execCommand(command: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const [cmd, ...args] = command.split(' ');
      const proc = spawn(cmd, args);

      let output = '';

      proc.stdout.on('data', (data) => {
        output += data.toString();
      });

      proc.on('close', (code) => {
        if (code === 0) {
          resolve(output);
        } else {
          reject(new Error(`Command failed: ${command}`));
        }
      });
    });
  }

  /**
   * Cleanup container
   */
  async cleanup(stack: string): Promise<void> {
    const containerId = this.warmPool.get(stack);
    if (containerId) {
      try {
        await this.execCommand(`docker rm -f ${containerId}`);
        this.warmPool.delete(stack);
        logger.info({ stack }, '🗑️  Container cleaned up');
      } catch (error) {
        logger.error({ error, stack }, '❌ Cleanup failed');
      }
    }
  }
}
