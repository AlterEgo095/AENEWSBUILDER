/**
 * MCP Security Tests
 *
 * Tests for ToolRegistry, RateLimiter, AuditLogger, AnomalyDetector,
 * CommandValidator, PermissionValidator, and exported metrics.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// ─── Mock heavy native dependencies BEFORE importing security module ─────────

vi.mock('dockerode', () => ({
  default: class MockDocker {
    listContainers = vi.fn().mockResolvedValue([]);
    createContainer = vi.fn().mockResolvedValue({ start: vi.fn() });
  },
}));

vi.mock('lru-cache', () => {
  class MockLRUCache {
    private store = new Map<string, any>();
    private _max: number;
    private _ttl: number;

    constructor(opts?: { max?: number; ttl?: number }) {
      this._max = opts?.max ?? 1000;
      this._ttl = opts?.ttl ?? 60000;
    }
    get(key: string) { return this.store.get(key); }
    set(key: string, value: any) {
      this.store.set(key, value);
      return true;
    }
    has(key: string) { return this.store.has(key); }
    delete(key: string) { return this.store.delete(key); }
    clear() { this.store.clear(); }
  }

  return { LRUCache: MockLRUCache };
});

vi.mock('pino', () => ({
  default: (opts?: any) => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    fatal: vi.fn(),
    child: vi.fn().mockReturnThis(),
  }),
}));

// ─── Import security module (mocks are active) ──────────────────────────────

import {
  Permission,
  ToolRegistry,
  RateLimiter,
  AuditLogger,
  AnomalyDetector,
  CommandValidator,
  PermissionValidator,
  setMetricsProvider,
  mcpToolsRegistered,
  mcpSecurityViolations,
  mcpRateLimitHits,
  mcpAnomalies,
  mcpInvocations,
  mcpPermissionDenials,
  type AuditLogEntry,
  type ToolSignature,
} from '../security.js';

describe('MCP Security', () => {
  // ═══════════════════════════════════════════════════════════════════════════
  // Permission Enum
  // ═══════════════════════════════════════════════════════════════════════════
  describe('Permission enum', () => {
    it('should have all expected permission values', () => {
      expect(Permission.NETWORK_ACCESS).toBe('network:access');
      expect(Permission.FILE_SYSTEM_READ).toBe('fs:read');
      expect(Permission.FILE_SYSTEM_WRITE).toBe('fs:write');
      expect(Permission.EXECUTE_CODE).toBe('exec:code');
      expect(Permission.DATABASE_READ).toBe('db:read');
      expect(Permission.DATABASE_WRITE).toBe('db:write');
      expect(Permission.API_CALL).toBe('api:call');
      expect(Permission.ENV_READ).toBe('env:read');
      expect(Permission.ENV_WRITE).toBe('env:write');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // ToolRegistry
  // ═══════════════════════════════════════════════════════════════════════════
  describe('ToolRegistry', () => {
    let registry: ToolRegistry;

    beforeEach(() => {
      // Set env so it doesn't use random key
      process.env.MCP_REGISTRY_SECRET = 'test-secret-key-for-testing-32chars';
      registry = new ToolRegistry();
    });

    it('should register a tool and return a ToolSignature', () => {
      const result = registry.register({
        toolId: 'test-tool',
        name: 'Test Tool',
        version: '1.0.0',
        author: 'Tester',
        permissions: [Permission.NETWORK_ACCESS],
      });

      expect(result).toBeDefined();
      expect(result.toolId).toBe('test-tool');
      expect(result.name).toBe('Test Tool');
      expect(result.version).toBe('1.0.0');
      expect(result.author).toBe('Tester');
      expect(result.permissions).toEqual([Permission.NETWORK_ACCESS]);
      expect(result.signature).toBeDefined();
      expect(result.nonce).toBeDefined();
      expect(result.timestamp).toBeInstanceOf(Date);
    });

    it('should verify a recently registered tool', () => {
      registry.register({
        toolId: 'verify-test',
        name: 'Verify Test',
        version: '1.0.0',
        author: 'Tester',
        permissions: [Permission.NETWORK_ACCESS],
      });

      expect(registry.verify('verify-test')).toBe(true);
    });

    it('should return false for verify of nonexistent tool', () => {
      expect(registry.verify('does-not-exist')).toBe(false);
    });

    it('should get a registered tool', () => {
      registry.register({
        toolId: 'get-test',
        name: 'Get Test',
        version: '1.0.0',
        author: 'Tester',
        permissions: [Permission.API_CALL],
      });

      const tool = registry.get('get-test');
      expect(tool).toBeDefined();
      expect(tool!.toolId).toBe('get-test');
    });

    it('should return undefined for get of nonexistent tool', () => {
      expect(registry.get('nope')).toBeUndefined();
    });

    it('should list all registered tools', () => {
      registry.register({
        toolId: 'list-a',
        name: 'List A',
        version: '1.0.0',
        author: 'Tester',
        permissions: [Permission.NETWORK_ACCESS],
      });
      registry.register({
        toolId: 'list-b',
        name: 'List B',
        version: '2.0.0',
        author: 'Tester',
        permissions: [Permission.EXECUTE_CODE],
      });

      const tools = registry.list();
      expect(tools.length).toBeGreaterThanOrEqual(2);
      const ids = tools.map((t) => t.toolId);
      expect(ids).toContain('list-a');
      expect(ids).toContain('list-b');
    });

    it('should check hasPermission correctly', () => {
      registry.register({
        toolId: 'perm-test',
        name: 'Perm Test',
        version: '1.0.0',
        author: 'Tester',
        permissions: [Permission.NETWORK_ACCESS, Permission.API_CALL],
      });

      expect(registry.hasPermission('perm-test', Permission.NETWORK_ACCESS)).toBe(true);
      expect(registry.hasPermission('perm-test', Permission.API_CALL)).toBe(true);
      expect(registry.hasPermission('perm-test', Permission.EXECUTE_CODE)).toBe(false);
      expect(registry.hasPermission('nonexistent', Permission.NETWORK_ACCESS)).toBe(false);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // RateLimiter
  // ═══════════════════════════════════════════════════════════════════════════
  describe('RateLimiter', () => {
    let limiter: RateLimiter;

    beforeEach(() => {
      limiter = new RateLimiter();
    });

    it('should allow requests within the limit', () => {
      expect(limiter.isAllowed('test-tool', 'user-1')).toBe(true);
    });

    it('should deny requests after exceeding the limit', () => {
      // replicate-v1 has limit of 10 req/min
      for (let i = 0; i < 10; i++) {
        limiter.isAllowed('replicate-v1', 'user-1');
      }
      expect(limiter.isAllowed('replicate-v1', 'user-1')).toBe(false);
    });

    it('should track remaining quota', () => {
      for (let i = 0; i < 3; i++) {
        limiter.isAllowed('figma-v1', 'user-x');
      }
      const remaining = limiter.getRemaining('figma-v1', 'user-x');
      expect(remaining).toBe(97); // 100 - 3
    });

    it('should return full quota for a new user', () => {
      const remaining = limiter.getRemaining('figma-v1', 'brand-new-user');
      expect(remaining).toBe(100);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // AuditLogger
  // ═══════════════════════════════════════════════════════════════════════════
  describe('AuditLogger', () => {
    let logger: AuditLogger;

    beforeEach(() => {
      logger = new AuditLogger();
    });

    it('should log and retrieve audit entries', () => {
      const entry: AuditLogEntry = {
        timestamp: new Date(),
        toolId: 'test-tool',
        userId: 'user-1',
        projectId: 'proj-1',
        action: 'execute',
        result: 'success',
        duration: 42,
      };
      logger.log(entry);

      const logs = logger.getLogs({});
      expect(logs.length).toBe(1);
      expect(logs[0].toolId).toBe('test-tool');
      expect(logs[0].result).toBe('success');
    });

    it('should filter logs by userId', () => {
      logger.log({
        timestamp: new Date(), toolId: 't1', userId: 'alice', projectId: 'p1',
        action: 'run', result: 'success',
      });
      logger.log({
        timestamp: new Date(), toolId: 't2', userId: 'bob', projectId: 'p1',
        action: 'run', result: 'failure',
      });

      const aliceLogs = logger.getLogs({ userId: 'alice' });
      expect(aliceLogs.length).toBe(1);
      expect(aliceLogs[0].userId).toBe('alice');
    });

    it('should filter logs by toolId', () => {
      logger.log({
        timestamp: new Date(), toolId: 'figma', userId: 'u1', projectId: 'p1',
        action: 'import', result: 'success',
      });
      logger.log({
        timestamp: new Date(), toolId: 'slack', userId: 'u1', projectId: 'p1',
        action: 'send', result: 'success',
      });

      const figmaLogs = logger.getLogs({ toolId: 'figma' });
      expect(figmaLogs.length).toBe(1);
      expect(figmaLogs[0].toolId).toBe('figma');
    });

    it('should return stats with correct counts', () => {
      logger.log({
        timestamp: new Date(), toolId: 't1', userId: 'u1', projectId: 'p1',
        action: 'run', result: 'success',
      });
      logger.log({
        timestamp: new Date(), toolId: 't1', userId: 'u1', projectId: 'p1',
        action: 'run', result: 'failure',
      });
      logger.log({
        timestamp: new Date(), toolId: 't1', userId: 'u1', projectId: 'p1',
        action: 'run', result: 'blocked',
      });

      const stats = logger.getStats('t1');
      expect(stats).toEqual({
        total: 3,
        success: 1,
        failure: 1,
        blocked: 1,
      });
    });

    it('should return overall stats when no toolId is provided', () => {
      logger.log({
        timestamp: new Date(), toolId: 'a', userId: 'u1', projectId: 'p1',
        action: 'run', result: 'success',
      });
      logger.log({
        timestamp: new Date(), toolId: 'b', userId: 'u1', projectId: 'p1',
        action: 'run', result: 'success',
      });

      const stats = logger.getStats();
      expect(stats.total).toBe(2);
      expect(stats.success).toBe(2);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // AnomalyDetector
  // ═══════════════════════════════════════════════════════════════════════════
  describe('AnomalyDetector', () => {
    let detector: AnomalyDetector;

    beforeEach(() => {
      detector = new AnomalyDetector();
    });

    it('should not flag normal behavior as anomalous', () => {
      const result = detector.detect('user-1', 'figma', 'import');
      expect(result.isAnomalous).toBe(false);
    });

    it('should detect burst requests (>50 in 1 min)', () => {
      for (let i = 0; i < 51; i++) {
        detector.detect('burst-user', 'figma', `action-${i}`);
      }
      const result = detector.detect('burst-user', 'figma', 'action-51');
      expect(result.isAnomalous).toBe(true);
      expect(result.reason).toContain('Burst');
    });

    it('should detect repeated failures (>10)', () => {
      for (let i = 0; i < 11; i++) {
        detector.detect('fail-user', 'tool', 'error');
      }
      const result = detector.detect('fail-user', 'tool', 'error');
      expect(result.isAnomalous).toBe(true);
      expect(result.reason).toContain('Repeated failures');
    });

    it('should return user behavior summary', () => {
      detector.detect('user-x', 'tool-a', 'run');
      detector.detect('user-x', 'tool-b', 'deploy');

      const behavior = detector.getUserBehavior('user-x');
      expect(behavior.totalRequests).toBe(2);
      expect(behavior.uniqueTools).toBeInstanceOf(Set);
      expect(behavior.uniqueTools.size).toBe(2);
      expect(typeof behavior.avgRequestsPerMin).toBe('number');
    });

    it('should return default behavior for unknown user', () => {
      const behavior = detector.getUserBehavior('unknown-user');
      expect(behavior.totalRequests).toBe(0);
      expect(behavior.uniqueTools.size).toBe(0);
      expect(behavior.avgRequestsPerMin).toBe(0);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // CommandValidator
  // ═══════════════════════════════════════════════════════════════════════════
  describe('CommandValidator', () => {
    it('should allow valid commands', () => {
      expect(CommandValidator.validate('npm install').valid).toBe(true);
      expect(CommandValidator.validate('git status').valid).toBe(true);
      expect(CommandValidator.validate('node app.js').valid).toBe(true);
      expect(CommandValidator.validate('python script.py').valid).toBe(true);
      expect(CommandValidator.validate('curl https://example.com').valid).toBe(true);
      expect(CommandValidator.validate('pnpm build').valid).toBe(true);
    });

    it('should reject forbidden commands', () => {
      const result = CommandValidator.validate('rm -rf /');
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('not allowed');
    });

    it('should reject shell injection patterns', () => {
      expect(CommandValidator.validate('npm install; rm -rf /').valid).toBe(false);
      expect(CommandValidator.validate('node -e "eval(malicious)"').valid).toBe(false);
    });

    it('should reject empty commands', () => {
      expect(CommandValidator.validate('').valid).toBe(false);
    });

    it('should reject commands that are too long', () => {
      const longCmd = 'node ' + 'a'.repeat(1000);
      expect(CommandValidator.validate(longCmd).valid).toBe(false);
    });

    it('should reject XSS patterns', () => {
      expect(CommandValidator.validate('node -e "<script>alert(1)</script>"').valid).toBe(false);
    });

    it('should reject path traversal patterns', () => {
      expect(CommandValidator.validate('cat ../../etc/passwd').valid).toBe(false);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // PermissionValidator
  // ═══════════════════════════════════════════════════════════════════════════
  describe('PermissionValidator', () => {
    it('should allow when all requested permissions are granted', () => {
      // figma-v1 is registered with NETWORK_ACCESS and API_CALL
      const result = PermissionValidator.validate('figma-v1', [Permission.NETWORK_ACCESS, Permission.API_CALL]);
      expect(result.allowed).toBe(true);
      expect(result.missing).toEqual([]);
    });

    it('should deny when some permissions are missing', () => {
      const result = PermissionValidator.validate('figma-v1', [Permission.NETWORK_ACCESS, Permission.EXECUTE_CODE]);
      expect(result.allowed).toBe(false);
      expect(result.missing).toContain(Permission.EXECUTE_CODE);
    });

    it('should deny for nonexistent tool', () => {
      const result = PermissionValidator.validate('nonexistent', [Permission.NETWORK_ACCESS]);
      expect(result.allowed).toBe(false);
      expect(result.missing).toEqual([Permission.NETWORK_ACCESS]);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Metrics Provider
  // ═══════════════════════════════════════════════════════════════════════════
  describe('setMetricsProvider', () => {
    it('should allow injecting a custom metrics provider', () => {
      const mockInc = vi.fn();
      const mockSet = vi.fn();

      setMetricsProvider({
        inc: mockInc,
        set: mockSet,
      });

      // Trigger metric by registering a tool
      process.env.MCP_REGISTRY_SECRET = 'test-secret-key-for-testing-32chars';
      const reg = new ToolRegistry();
      reg.register({
        toolId: 'metric-test',
        name: 'Metric Test',
        version: '1.0.0',
        author: 'Tester',
        permissions: [Permission.NETWORK_ACCESS],
      });

      // setMetricsProvider uses Object.assign, so mcpToolsRegistered.set should now be mockSet
      // The register call triggers mcpToolsRegistered.set(1)
      // Verify the mock was registered by calling it directly
      mcpToolsRegistered.set(5);
      expect(mockSet).toHaveBeenCalledWith(5);
    });

    it('exported metric objects should have inc/set methods', () => {
      expect(typeof mcpSecurityViolations.inc).toBe('function');
      expect(typeof mcpRateLimitHits.inc).toBe('function');
      expect(typeof mcpAnomalies.inc).toBe('function');
      expect(typeof mcpInvocations.inc).toBe('function');
      expect(typeof mcpPermissionDenials.inc).toBe('function');
      expect(typeof mcpToolsRegistered.set).toBe('function');
    });
  });
});
