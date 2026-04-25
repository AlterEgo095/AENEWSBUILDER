/**
 * MCP Security Layer
 * Features: Signature verification, permission system, container isolation
 * @module mcp/security
 */

import crypto from 'crypto';
import { Docker } from 'dockerode';
import { logger } from '../../apps/api/src/config/logger.js';
import { LRUCache } from 'lru-cache';

const docker = new Docker();

// ================== TOOL SIGNATURE SYSTEM ==================

export interface ToolSignature {
  toolId: string;
  name: string;
  version: string;
  author: string;
  signature: string; // HMAC-SHA256 of tool metadata
  publicKey?: string;
  permissions: Permission[];
  timestamp: Date;
  nonce?: string; // Add nonce for replay protection
}

export enum Permission {
  NETWORK_ACCESS = 'network:access',
  FILE_SYSTEM_READ = 'fs:read',
  FILE_SYSTEM_WRITE = 'fs:write',
  EXECUTE_CODE = 'exec:code',
  DATABASE_READ = 'db:read',
  DATABASE_WRITE = 'db:write',
  API_CALL = 'api:call',
  ENV_READ = 'env:read',
  ENV_WRITE = 'env:write',
}

export class ToolRegistry {
  private registry = new Map<string, ToolSignature>();
  private readonly SECRET_KEY: string;
  private usedNonces = new LRUCache<string, boolean>({
    max: 10000,
    ttl: 5 * 60 * 1000, // 5 minutes
  });

  constructor() {
    // CRITICAL: Generate secure key if not provided
    if (!process.env.MCP_REGISTRY_SECRET) {
      if (process.env.NODE_ENV === 'production') {
        logger.error('❌ CRITICAL: MCP_REGISTRY_SECRET not set in production!');
        throw new Error('MCP_REGISTRY_SECRET is required in production');
      }
      this.SECRET_KEY = crypto.randomBytes(32).toString('hex');
      logger.warn('⚠️ Generated random MCP_REGISTRY_SECRET (NOT FOR PRODUCTION)', {
        key: this.SECRET_KEY.substring(0, 8) + '...',
      });
    } else {
      this.SECRET_KEY = process.env.MCP_REGISTRY_SECRET;
    }
  }

  /**
   * Register a tool with signature (with nonce)
   */
  register(tool: Omit<ToolSignature, 'signature' | 'timestamp' | 'nonce'>): ToolSignature {
    const timestamp = new Date();
    const nonce = crypto.randomBytes(16).toString('hex');

    const payload = {
      toolId: tool.toolId,
      name: tool.name,
      version: tool.version,
      author: tool.author,
      permissions: tool.permissions,
      timestamp: timestamp.toISOString(),
      nonce,
    };

    const signature = this.generateSignature(payload);

    const signedTool: ToolSignature = {
      ...tool,
      signature,
      timestamp,
      nonce,
    };

    this.registry.set(tool.toolId, signedTool);

    logger.info('Tool registered', {
      toolId: tool.toolId,
      version: tool.version,
      permissions: tool.permissions.length,
    });

    return signedTool;
  }

  /**
   * Verify tool signature (with nonce + timestamp validation)
   */
  verify(toolId: string, requestNonce?: string): boolean {
    const tool = this.registry.get(toolId);
    if (!tool) {
      logger.warn('Tool not found in registry', { toolId });
      return false;
    }

    // Check nonce replay protection
    if (requestNonce) {
      if (this.usedNonces.has(requestNonce)) {
        logger.error('Nonce replay detected', { toolId, nonce: requestNonce });
        return false;
      }
      this.usedNonces.set(requestNonce, true);
    }

    // Verify timestamp (reject if older than 5 minutes)
    const age = Date.now() - tool.timestamp.getTime();
    if (age > 5 * 60 * 1000) {
      logger.error('Tool signature expired', {
        toolId,
        age: Math.floor(age / 1000) + 's',
      });
      return false;
    }

    const payload = {
      toolId: tool.toolId,
      name: tool.name,
      version: tool.version,
      author: tool.author,
      permissions: tool.permissions,
      timestamp: tool.timestamp.toISOString(),
      nonce: tool.nonce,
    };

    const expectedSignature = this.generateSignature(payload);

    if (tool.signature !== expectedSignature) {
      logger.error('Tool signature mismatch', {
        toolId,
        expected: expectedSignature,
        actual: tool.signature,
      });
      return false;
    }

    return true;
  }

  /**
   * Check if tool has permission
   */
  hasPermission(toolId: string, permission: Permission): boolean {
    const tool = this.registry.get(toolId);
    if (!tool) return false;

    return tool.permissions.includes(permission);
  }

  /**
   * Get tool info
   */
  get(toolId: string): ToolSignature | undefined {
    return this.registry.get(toolId);
  }

  /**
   * List all registered tools
   */
  list(): ToolSignature[] {
    return Array.from(this.registry.values());
  }

  /**
   * Generate HMAC signature
   */
  private generateSignature(payload: any): string {
    const hmac = crypto.createHmac('sha256', this.SECRET_KEY);
    hmac.update(JSON.stringify(payload));
    return hmac.digest('hex');
  }
}

// ================== COMMAND VALIDATOR ==================

export class CommandValidator {
  // Whitelist of allowed commands (prevent code injection)
  private static readonly ALLOWED_COMMANDS = new Set([
    'node',
    'npm',
    'npx',
    'yarn',
    'pnpm',
    'python',
    'python3',
    'pip',
    'pip3',
    'bash',
    'sh',
    'ls',
    'cat',
    'echo',
    'pwd',
    'mkdir',
    'touch',
    'cp',
    'mv',
    'git',
  ]);

  // Blacklist of dangerous patterns
  private static readonly DANGEROUS_PATTERNS = [
    /rm\s+-rf\s+\//i, // rm -rf /
    /dd\s+if=/i, // dd if=
    /:\(\)\s*\{\s*:\|:\&\s*\}\s*;\s*:/i, // Fork bomb
    /mkfs/i, // Format filesystem
    /shutdown/i,
    /reboot/i,
    /init\s+[0-6]/i,
    />(\s*)\/dev\/sda/i, // Overwrite disk
    /curl.*\|.*sh/i, // curl | sh
    /wget.*\|.*sh/i, // wget | sh
  ];

  /**
   * Validate command before execution
   */
  static validate(command: string[]): { valid: boolean; reason?: string } {
    if (!command || command.length === 0) {
      return { valid: false, reason: 'Empty command' };
    }

    const cmd = command[0];

    // Check if command is whitelisted
    if (!this.ALLOWED_COMMANDS.has(cmd)) {
      return {
        valid: false,
        reason: `Command '${cmd}' not in whitelist`,
      };
    }

    // Check for dangerous patterns
    const fullCommand = command.join(' ');
    for (const pattern of this.DANGEROUS_PATTERNS) {
      if (pattern.test(fullCommand)) {
        return {
          valid: false,
          reason: `Dangerous pattern detected: ${pattern}`,
        };
      }
    }

    return { valid: true };
  }
}

// ================== RATE LIMITER ==================

export class RateLimiter {
  private requests = new LRUCache<string, number[]>({
    max: 1000,
    ttl: 60 * 1000, // 1 minute
  });

  private readonly MAX_REQUESTS_PER_MINUTE = 10;

  /**
   * Check if request should be allowed
   */
  check(toolId: string): { allowed: boolean; retryAfter?: number } {
    const now = Date.now();
    const timestamps = this.requests.get(toolId) || [];

    // Remove old timestamps (older than 1 minute)
    const recentTimestamps = timestamps.filter((t) => now - t < 60000);

    if (recentTimestamps.length >= this.MAX_REQUESTS_PER_MINUTE) {
      const oldestTimestamp = recentTimestamps[0];
      const retryAfter = Math.ceil((oldestTimestamp + 60000 - now) / 1000);

      return {
        allowed: false,
        retryAfter,
      };
    }

    // Add current timestamp
    recentTimestamps.push(now);
    this.requests.set(toolId, recentTimestamps);

    return { allowed: true };
  }

  /**
   * Get rate limit status
   */
  getStatus(toolId: string): { remaining: number; resetAt: Date } {
    const now = Date.now();
    const timestamps = this.requests.get(toolId) || [];
    const recentTimestamps = timestamps.filter((t) => now - t < 60000);

    const remaining = Math.max(
      0,
      this.MAX_REQUESTS_PER_MINUTE - recentTimestamps.length
    );

    const resetAt = recentTimestamps.length > 0
      ? new Date(recentTimestamps[0] + 60000)
      : new Date(now + 60000);

    return { remaining, resetAt };
  }
}

export const toolRegistry = new ToolRegistry();
export const rateLimiter = new RateLimiter();

// ================== CONTAINER ISOLATION ==================

export interface IsolatedExecutionConfig {
  toolId: string;
  image: string;
  command: string[];
  env?: Record<string, string>;
  timeout?: number;
  memory?: string;
  cpus?: number;
  allowedPermissions?: Permission[];
}

export class SecureExecutor {
  private readonly ISOLATED_NETWORK = 'mcp-isolated';

  constructor() {
    this.initialize();
  }

  /**
   * Initialize secure executor
   */
  private async initialize() {
    await this.createIsolatedNetwork();
  }

  /**
   * Create isolated network (no internet)
   */
  private async createIsolatedNetwork() {
    try {
      const networks = await docker.listNetworks({
        filters: { name: [this.ISOLATED_NETWORK] },
      });

      if (networks.length > 0) return;

      await docker.createNetwork({
        Name: this.ISOLATED_NETWORK,
        Driver: 'bridge',
        Internal: true, // No external access
        EnableIPv6: false,
      });

      logger.info(`✅ Created isolated network: ${this.ISOLATED_NETWORK}`);
    } catch (error: any) {
      logger.error('Failed to create isolated network', {
        error: error.message,
      });
    }
  }

  /**
   * Execute tool in isolated container (with security checks)
   */
  async execute(config: IsolatedExecutionConfig): Promise<{
    stdout: string;
    stderr: string;
    exitCode: number;
  }> {
    const startTime = Date.now();

    // 1. Rate limiting
    const rateLimitCheck = rateLimiter.check(config.toolId);
    if (!rateLimitCheck.allowed) {
      throw new Error(
        `Rate limit exceeded for ${config.toolId}. Retry after ${rateLimitCheck.retryAfter}s`
      );
    }

    // 2. Command validation
    const commandValidation = CommandValidator.validate(config.command);
    if (!commandValidation.valid) {
      logger.error('Dangerous command blocked', {
        toolId: config.toolId,
        command: config.command,
        reason: commandValidation.reason,
      });
      throw new Error(`Command validation failed: ${commandValidation.reason}`);
    }

    // 3. Verify tool signature
    if (!toolRegistry.verify(config.toolId)) {
      throw new Error(`Tool ${config.toolId} signature verification failed`);
    }

    // Check permissions
    const tool = toolRegistry.get(config.toolId);
    if (!tool) {
      throw new Error(`Tool ${config.toolId} not registered`);
    }

    // Validate requested permissions
    if (config.allowedPermissions) {
      for (const perm of config.allowedPermissions) {
        if (!tool.permissions.includes(perm)) {
          throw new Error(
            `Tool ${config.toolId} does not have permission: ${perm}`
          );
        }
      }
    }

    // Determine network mode based on permissions
    const networkMode = tool.permissions.includes(Permission.NETWORK_ACCESS)
      ? 'bridge'
      : 'none';

    // Create container with strict isolation
    const container = await docker.createContainer({
      Image: config.image,
      Cmd: config.command,
      Env: Object.entries(config.env || {}).map(([k, v]) => `${k}=${v}`),
      HostConfig: {
        Memory: this.parseMemory(config.memory || '512m'),
        MemorySwap: this.parseMemory(config.memory || '512m'),
        NanoCpus: (config.cpus || 0.5) * 1e9,
        NetworkMode: networkMode,
        PidsLimit: 50,
        ReadonlyRootfs: !tool.permissions.includes(Permission.FILE_SYSTEM_WRITE),
        SecurityOpt: ['no-new-privileges:true'],
        CapDrop: ['ALL'], // Drop all capabilities
        AutoRemove: true,
      },
      Labels: {
        'aenews.type': 'mcp',
        'aenews.tool': config.toolId,
        'aenews.version': tool.version,
      },
    });

    try {
      // Start container
      await container.start();

      // Wait for completion or timeout
      const timeout = config.timeout || 30000;
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Execution timeout')), timeout);
      });

      await Promise.race([container.wait(), timeoutPromise]);

      // Get logs (with size limit to prevent memory overflow)
      const logs = await container.logs({
        stdout: true,
        stderr: true,
        tail: 10000, // Limit to last 10k lines
      });

      const logsStr = logs.toString('utf-8', 0, Math.min(logs.length, 10 * 1024 * 1024)); // Max 10MB
      const stdout = logsStr.split('\n').filter((l) => !l.includes('stderr')).join('\n');
      const stderr = logsStr.split('\n').filter((l) => l.includes('stderr')).join('\n');

      // Check output size
      if (stdout.length > 10 * 1024 * 1024) {
        logger.warn('Tool output truncated (exceeded 10MB)', { toolId: config.toolId });
      }

      // Get exit code
      const inspectData = await container.inspect();
      const exitCode = inspectData.State.ExitCode || 0;

      const duration = Date.now() - startTime;

      logger.info('MCP tool executed', {
        toolId: config.toolId,
        exitCode,
        duration,
        networkMode,
      });

      return { stdout, stderr, exitCode };
    } catch (error: any) {
      logger.error('MCP tool execution failed', {
        toolId: config.toolId,
        error: error.message,
      });

      // Ensure cleanup
      try {
        await container.stop({ t: 1 });
        await container.remove({ force: true });
      } catch {}

      throw error;
    }
  }

  /**
   * Parse memory string to bytes
   */
  private parseMemory(mem: string): number {
    const units: Record<string, number> = {
      k: 1024,
      m: 1024 * 1024,
      g: 1024 * 1024 * 1024,
    };

    const match = mem.match(/^(\d+)([kmg])$/i);
    if (!match) throw new Error(`Invalid memory format: ${mem}`);

    const [, value, unit] = match;
    return parseInt(value, 10) * units[unit.toLowerCase()];
  }
}

export const secureExecutor = new SecureExecutor();

// ================== PERMISSION VALIDATOR ==================

export class PermissionValidator {
  /**
   * Validate execution request
   */
  static validate(
    toolId: string,
    requestedPermissions: Permission[]
  ): { allowed: boolean; missing: Permission[] } {
    const tool = toolRegistry.get(toolId);

    if (!tool) {
      return { allowed: false, missing: requestedPermissions };
    }

    const missing = requestedPermissions.filter(
      (perm) => !tool.permissions.includes(perm)
    );

    return {
      allowed: missing.length === 0,
      missing,
    };
  }

  /**
   * Request permission upgrade (for future use)
   */
  static async requestUpgrade(
    toolId: string,
    newPermissions: Permission[]
  ): Promise<boolean> {
    logger.info('Permission upgrade requested', {
      toolId,
      newPermissions,
    });

    // In production, this would trigger an approval workflow
    // For now, we reject all upgrade requests
    return false;
  }
}

// ================== REGISTER DEFAULT TOOLS ==================

// Figma
toolRegistry.register({
  toolId: 'figma-v1',
  name: 'Figma Importer',
  version: '1.0.0',
  author: 'AENEWS',
  permissions: [Permission.NETWORK_ACCESS, Permission.API_CALL],
});

// Notion
toolRegistry.register({
  toolId: 'notion-v1',
  name: 'Notion Importer',
  version: '1.0.0',
  author: 'AENEWS',
  permissions: [Permission.NETWORK_ACCESS, Permission.API_CALL],
});

// Playwright
toolRegistry.register({
  toolId: 'playwright-v1',
  name: 'Playwright Screenshot',
  version: '1.0.0',
  author: 'AENEWS',
  permissions: [
    Permission.NETWORK_ACCESS,
    Permission.EXECUTE_CODE,
    Permission.FILE_SYSTEM_WRITE,
  ],
});

// Cloudflare
toolRegistry.register({
  toolId: 'cloudflare-v1',
  name: 'Cloudflare Deploy',
  version: '1.0.0',
  author: 'AENEWS',
  permissions: [
    Permission.NETWORK_ACCESS,
    Permission.API_CALL,
    Permission.FILE_SYSTEM_READ,
  ],
});

// Replicate
toolRegistry.register({
  toolId: 'replicate-v1',
  name: 'Replicate AI',
  version: '1.0.0',
  author: 'AENEWS',
  permissions: [Permission.NETWORK_ACCESS, Permission.API_CALL],
});

logger.info('✅ MCP Security Layer initialized', {
  registeredTools: toolRegistry.list().length,
});
