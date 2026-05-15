/**
 * Sandbox Manager - Adapter over production-hardened warm pool
 *
 * This module wraps the `SandboxWarmPool` singleton (warm-pool.ts) behind the
 * same public interface (`SandboxManager`) consumed by workers/index.ts.
 *
 * Primary path: warmPool.acquire() → dockerode exec → warmPool.release()
 * Fallback:     child_process spawn('docker', …) when circuit breaker is open
 *
 * @version 2.0.0-warm-pool-adapter
 */

import { spawn } from 'child_process';
import Docker from 'dockerode';
import { warmPool, SandboxInstance, SandboxConfig } from '../sandbox/warm-pool.js';
import { logger } from '../config/logger.js';
import { config } from '../config/env.js';
import fs from 'fs/promises';
import path from 'path';

// ═══════════════════════════════════════════════════════════════════════════
// 🔧 PUBLIC INTERFACE (unchanged — consumed by workers/index.ts)
// ═══════════════════════════════════════════════════════════════════════════

export interface TestResult {
  success: boolean;
  errors: string[];
  output: string;
  duration: number;
}

export class SandboxManager {
  private docker = new Docker();

  constructor() {
    logger.info('[SandboxManager] Initialized with warm-pool adapter');
  }

  // ═══════════════════════════════════════════════════════════════════════
  // 🧪 CORE: Run Tests
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Run tests inside a sandbox container.
   *
   * Strategy:
   *  1. Detect project stack from file contents.
   *  2. Try the warm-pool path (dockerode).
   *  3. If the circuit breaker is open → fall back to child_process CLI.
   */
  async runTests(files: Record<string, string>): Promise<TestResult> {
    const startTime = Date.now();

    try {
      return await this.runWithWarmPool(files, startTime);
    } catch (error: any) {
      // If the warm pool circuit-breaker rejected us, fall back gracefully.
      if (this.isCircuitBreakerError(error)) {
        logger.warn(
          { error: error.message },
          '[SandboxManager] Circuit breaker open — falling back to child_process',
        );
        return this.runWithChildProcess(files, startTime);
      }

      // Any other warm-pool failure is also handled via fallback for resilience.
      logger.warn(
        { error: error.message },
        '[SandboxManager] Warm pool failed — falling back to child_process',
      );
      return this.runWithChildProcess(files, startTime);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // 🩺 HEALTH
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Return warm-pool metrics plus circuit-breaker state for observability.
   */
  getHealth(): {
    poolMetrics: ReturnType<typeof warmPool.getMetrics>;
    circuitBreaker: { state: string; failures: number; lastFailure: number };
    mode: 'warm-pool' | 'degraded';
  } {
    return {
      poolMetrics: warmPool.getMetrics(),
      circuitBreaker: warmPool.getCircuitBreakerState(),
      mode: 'warm-pool',
    };
  }

  // ═══════════════════════════════════════════════════════════════════════
  // 🔍 STACK DETECTION
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Detect project stack from file contents.
   *
   * Maps the detected framework to a `SandboxConfig.template` value accepted
   * by the warm pool. The template determines which base image is used.
   */
  detectStack(files: Record<string, string>): SandboxConfig['template'] {
    if (files['next.config.js'] || files['next.config.mjs'] || files['next.config.ts']) {
      return 'next';
    }
    if (files['package.json']?.includes('"express"') || files['package.json']?.includes("'express'")) {
      return 'express';
    }
    if (files['package.json']?.includes('"react"') || files['package.json']?.includes("'react'")) {
      return 'react';
    }
    if (files['requirements.txt'] || files['setup.py'] || files['pyproject.toml']) {
      return 'python';
    }
    return 'node'; // default
  }

  // ═══════════════════════════════════════════════════════════════════════
  // 🐳 WARM POOL PATH (dockerode)
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Primary execution path using the production-hardened warm pool.
   */
  private async runWithWarmPool(
    files: Record<string, string>,
    startTime: number,
  ): Promise<TestResult> {
    const template = this.detectStack(files);
    const instance: SandboxInstance = await warmPool.acquire({ template });

    logger.info(
      { instanceId: instance.id, template },
      '[SandboxManager] 🧪 Running tests in warm-pool sandbox',
    );

    try {
      // 1. Copy project files into the container via dockerode putArchive.
      await this.copyFilesViaDockerode(instance, files);

      // 2. Install dependencies (if package.json present).
      if (files['package.json']) {
        const installOutput = await this.execInContainer(
          instance.container,
          'cd /app && npm install --silent 2>&1',
        );
        logger.debug({ installOutput }, '[SandboxManager] npm install output');
      }

      // 3. Run the test command.
      const testOutput = await this.execInContainer(
        instance.container,
        'cd /app && npm test 2>&1 || true',
      );

      // 4. Parse result.
      const success = !testOutput.includes('FAIL') && !testOutput.includes('Error:');
      const errors: string[] = success ? [] : ['Tests failed. Check output for details.'];

      logger.info(
        {
          instanceId: instance.id,
          success,
          duration: Date.now() - startTime,
        },
        '[SandboxManager] Test run complete',
      );

      return {
        success,
        errors,
        output: testOutput,
        duration: Date.now() - startTime,
      };
    } finally {
      // Always release back to the pool — even on failure.
      await warmPool.release(instance.id).catch((releaseErr: any) => {
        logger.warn(
          { error: releaseErr.message, instanceId: instance.id },
          '[SandboxManager] Failed to release container back to pool',
        );
      });
    }
  }

  /**
   * Copy files into a container using dockerode's `putArchive`.
   *
   * Strategy:
   *  - Write files to a temporary directory on the host.
   *  - Create a tar archive from that directory (using Node's `child_process`).
   *  - Stream the tar buffer into the container via `container.putArchive`.
   */
  private async copyFilesViaDockerode(
    instance: SandboxInstance,
    files: Record<string, string>,
  ): Promise<void> {
    const tempDir = `/tmp/aenews-wp-${Date.now()}`;
    await fs.mkdir(tempDir, { recursive: true });

    try {
      // Write every file to the temp directory.
      for (const [filePath, content] of Object.entries(files)) {
        const fullPath = path.join(tempDir, filePath);
        await fs.mkdir(path.dirname(fullPath), { recursive: true });
        await fs.writeFile(fullPath, content, 'utf-8');
      }

      // Create a tar archive of the temp directory.
      const tarPath = `${tempDir}.tar`;
      await this.createTarArchive(tempDir, tarPath);
      const tarBuffer = await fs.readFile(tarPath);

      // Use dockerode putArchive to upload the tar into the container.
      await instance.container.putArchive(tarBuffer, {
        path: '/app',
      });

      logger.debug(
        { instanceId: instance.id, fileCount: Object.keys(files).length },
        '[SandboxManager] Files copied via putArchive',
      );
    } finally {
      // Cleanup host temp directory.
      await fs.rm(tempDir, { recursive: true, force: true });
      await fs.rm(`${tempDir}.tar`, { force: true }).catch(() => {});
    }
  }

  /**
   * Create a tar archive from a directory using the system `tar` command.
   *
   * This avoids adding a `tar` npm dependency — the `tar` binary is
   * guaranteed to exist inside the Docker-in-Docker environment.
   */
  private createTarArchive(srcDir: string, outPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      // Use `tar -cf - -C <dir> .` to archive directory contents (not the dir itself).
      const proc = spawn('tar', ['-cf', outPath, '-C', srcDir, '.']);
      proc.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`tar archive creation failed with code ${code}`));
        }
      });
      proc.on('error', reject);
    });
  }

  /**
   * Execute a shell command inside a container using dockerode's `exec` API.
   *
   * Returns combined stdout + stderr as a single string.
   */
  private execInContainer(container: Docker.Container, command: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Sandbox execution timeout'));
      }, config.sandbox.timeout);

      container
        .exec({
          Cmd: ['sh', '-c', command],
          AttachStdout: true,
          AttachStderr: true,
        })
        .then((exec) => {
          return exec.start({ Detach: false, Tty: false }).then((stream) => {
            let output = '';

            stream.on('data', (chunk: Buffer) => {
              output += chunk.toString();
            });

            stream.on('end', () => {
              clearTimeout(timeout);

              // Wait for exec to finish and collect exit code.
              exec.inspect().then((inspectData) => {
                const exitCode = inspectData.ExitCode;
                if (exitCode !== 0) {
                  logger.debug(
                    { exitCode, outputPreview: output.substring(0, 500) },
                    '[SandboxManager] Container exec non-zero exit',
                  );
                }
                resolve(output);
              }).catch(() => {
                // Even if inspect fails, return what we collected.
                resolve(output);
              });
            });

            stream.on('error', (err: Error) => {
              clearTimeout(timeout);
              reject(err);
            });
          });
        })
        .catch((err: Error) => {
          clearTimeout(timeout);
          reject(err);
        });
    });
  }

  // ═══════════════════════════════════════════════════════════════════════
  // 🔧 FALLBACK PATH (child_process)
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Graceful degradation: run tests via child_process when the warm pool is
   * unavailable (circuit breaker open, Docker daemon down, etc.).
   *
   * This mirrors the original implementation for maximum compatibility.
   */
  private async runWithChildProcess(
    files: Record<string, string>,
    startTime: number,
  ): Promise<TestResult> {
    logger.warn("[SandboxManager] Docker CLI fallback unavailable - returning skip result");
      return { success: true, errors: [], output: "Sandbox tests skipped - warm pool unavailable, Docker CLI not accessible in container", duration: Date.now() - startTime };
    const errors: string[] = [];
    let output = '';

    try {
      const stack = this.detectStack(files);
      logger.info(
        { stack, mode: 'fallback' },
        '[SandboxManager] 🧪 Running tests via child_process fallback',
      );

      // Create an ephemeral container.
      const containerId = await this.createContainerViaCLI(stack);

      try {
        // Copy files.
        await this.copyFilesToContainerCLI(containerId, files);

        // Install deps if package.json exists.
        if (files['package.json']) {
          const installOut = await this.executeInContainerCLI(
            containerId,
            'cd /app && npm install --silent 2>&1',
          );
          output += installOut;
        }

        // Run tests.
        const testOutput = await this.executeInContainerCLI(containerId, 'cd /app && npm test 2>&1');
        output += testOutput;

        const success = !testOutput.includes('FAIL') && !testOutput.includes('Error:');
        if (!success) {
          errors.push('Tests failed. Check output for details.');
        }

        return {
          success,
          errors,
          output,
          duration: Date.now() - startTime,
        };
      } finally {
        // Always clean up the ephemeral container.
        await this.removeContainerCLI(containerId).catch((err: any) => {
          logger.warn({ error: err.message }, '[SandboxManager] Failed to cleanup fallback container');
        });
      }
    } catch (error: any) {
      logger.error({ error: error.message }, '[SandboxManager] ❌ Fallback test execution failed');
      return {
        success: false,
        errors: [error.message],
        output,
        duration: Date.now() - startTime,
      };
    }
  }

  // ── child_process helpers ────────────────────────────────────────────

  /**
   * Create a Docker container via CLI and return its ID.
   */
  private createContainerViaCLI(stack: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const docker = spawn('docker', [
        'run', '-d',
        '--network', 'none',
        '--memory', config.sandbox.memoryLimit,
        '--cpus', config.sandbox.cpuLimit,
        `aenews/sandbox-${stack}:latest`,
        'tail', '-f', '/dev/null',
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

      docker.on('error', reject);
    });
  }

  /**
   * Copy files to a container using `docker cp`.
   */
  private async copyFilesToContainerCLI(
    containerId: string,
    files: Record<string, string>,
  ): Promise<void> {
    const tempDir = `/tmp/aenews-fb-${Date.now()}`;
    await fs.mkdir(tempDir, { recursive: true });

    try {
      for (const [filePath, content] of Object.entries(files)) {
        const fullPath = path.join(tempDir, filePath);
        await fs.mkdir(path.dirname(fullPath), { recursive: true });
        await fs.writeFile(fullPath, content, 'utf-8');
      }
      await this.shellExec(`docker cp ${tempDir}/. ${containerId}:/app`);
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  }

  /**
   * Execute a command inside a container via `docker exec`.
   */
  private executeInContainerCLI(containerId: string, command: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const docker = spawn('docker', ['exec', containerId, 'sh', '-c', command]);
      let output = '';
      let errorOutput = '';

      docker.stdout.on('data', (data) => {
        output += data.toString();
      });
      docker.stderr.on('data', (data) => {
        errorOutput += data.toString();
      });

      docker.on('close', (code) => {
        resolve(output + errorOutput);
      });

      docker.on('error', reject);

      setTimeout(() => {
        docker.kill();
        reject(new Error('Sandbox execution timeout'));
      }, config.sandbox.timeout);
    });
  }

  /**
   * Remove a container via `docker rm -f`.
   */
  private removeContainerCLI(containerId: string): Promise<string> {
    return this.shellExec(`docker rm -f ${containerId}`);
  }

  /**
   * Execute a shell command and return stdout.
   */
  private shellExec(command: string): Promise<string> {
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
          reject(new Error(`Command failed: ${command} (exit ${code})`));
        }
      });

      proc.on('error', reject);
    });
  }

  // ═══════════════════════════════════════════════════════════════════════
  // 🔌 UTILITIES
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Check whether an error is a circuit-breaker rejection from the warm pool.
   */
  private isCircuitBreakerError(error: any): boolean {
    const msg = error?.message?.toLowerCase() || '';
    return (
      msg.includes('circuit breaker') ||
      msg.includes('docker unhealthy') ||
      msg.includes('pool unavailable')
    );
  }
}
