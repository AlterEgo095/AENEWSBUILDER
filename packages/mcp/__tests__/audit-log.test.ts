/**
 * MCP Audit Log Tests
 */

import { vi, describe, it, expect, beforeEach } from 'vitest';

// ─── Mock ioredis BEFORE importing the module ───────────────────────────

const mockRedis = {
  lpush: vi.fn().mockResolvedValue(1),
  ltrim: vi.fn().mockResolvedValue('OK'),
  lrange: vi.fn().mockResolvedValue([]),
};

vi.mock('ioredis', () => ({
  default: vi.fn(() => mockRedis),
}));

vi.mock('../adapter.js', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

// ─── Import module (mocks are active) ────────────────────────────────────

import { AuditLog } from '../audit-log.js';

describe('AuditLog', () => {
  let auditLog: AuditLog;

  beforeEach(() => {
    vi.clearAllMocks();
    auditLog = new AuditLog();
  });

  // ═══════════════════════════════════════════════════════════════════════
  // log()
  // ═══════════════════════════════════════════════════════════════════════
  describe('log', () => {
    it('should create entry with auto-generated id', async () => {
      const id = await auditLog.log({
        toolId: 'test-tool',
        action: 'execute',
        status: 'success',
      });

      expect(id).toBeTruthy();
      expect(typeof id).toBe('string');
      expect(id).toMatch(/^audit_/);
    });

    it('should create entry with ISO timestamp', async () => {
      const id = await auditLog.log({
        toolId: 'test-tool',
        action: 'execute',
        status: 'success',
      });

      // Verify lpush was called with a JSON string containing an ISO timestamp
      const lpushCall = mockRedis.lpush.mock.calls[0];
      const entryStr = lpushCall[1]; // Second argument to lpush is the JSON string
      const entry = JSON.parse(entryStr);

      expect(entry.id).toBe(id);
      expect(entry.timestamp).toBeDefined();
      // Should be a valid ISO date string
      expect(() => new Date(entry.timestamp)).not.toThrow();
      expect(entry.toolId).toBe('test-tool');
      expect(entry.action).toBe('execute');
      expect(entry.status).toBe('success');
    });

    it('should call lpush with correct key prefix', async () => {
      await auditLog.log({
        toolId: 'tool-a',
        action: 'run',
        status: 'success',
      });

      expect(mockRedis.lpush).toHaveBeenCalledWith(
        'mcp:audit:log',
        expect.any(String),
      );
    });

    it('should call ltrim to keep last 10000 entries', async () => {
      await auditLog.log({
        toolId: 'tool-b',
        action: 'run',
        status: 'success',
      });

      expect(mockRedis.ltrim).toHaveBeenCalledWith('mcp:audit:log', 0, 9999);
    });

    it('should return the generated id', async () => {
      const id = await auditLog.log({
        toolId: 'tool-c',
        action: 'run',
        status: 'error',
      });

      expect(id).toBeTruthy();
      expect(id.length).toBeGreaterThan(0);
    });

    it('should preserve all entry fields in the stored JSON', async () => {
      await auditLog.log({
        toolId: 'full-tool',
        action: 'deploy',
        userId: 'user-123',
        input: { key: 'value' },
        output: { result: 'ok' },
        duration: 42,
        status: 'success',
        metadata: { region: 'us-east' },
      });

      const lpushCall = mockRedis.lpush.mock.calls[0];
      const entry = JSON.parse(lpushCall[1]);

      expect(entry.toolId).toBe('full-tool');
      expect(entry.action).toBe('deploy');
      expect(entry.userId).toBe('user-123');
      expect(entry.input).toEqual({ key: 'value' });
      expect(entry.output).toEqual({ result: 'ok' });
      expect(entry.duration).toBe(42);
      expect(entry.status).toBe('success');
      expect(entry.metadata).toEqual({ region: 'us-east' });
    });

    it('should catch redis errors and return empty string', async () => {
      mockRedis.lpush.mockRejectedValueOnce(new Error('Redis connection lost'));

      const id = await auditLog.log({
        toolId: 'fail-tool',
        action: 'run',
        status: 'success',
      });

      expect(id).toBe('');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════
  // getRecent()
  // ═══════════════════════════════════════════════════════════════════════
  describe('getRecent', () => {
    it('should return parsed entries', async () => {
      const entries = [
        { id: 'audit_1', timestamp: new Date().toISOString(), toolId: 'tool-a', action: 'run', status: 'success' },
        { id: 'audit_2', timestamp: new Date().toISOString(), toolId: 'tool-b', action: 'deploy', status: 'error' },
      ];
      mockRedis.lrange.mockResolvedValueOnce(entries.map((e) => JSON.stringify(e)));

      const result = await auditLog.getRecent(10);

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('audit_1');
      expect(result[0].toolId).toBe('tool-a');
      expect(result[1].id).toBe('audit_2');
      expect(result[1].status).toBe('error');
    });

    it('should pass correct limit to lrange', async () => {
      mockRedis.lrange.mockResolvedValueOnce([]);

      await auditLog.getRecent(25);

      expect(mockRedis.lrange).toHaveBeenCalledWith('mcp:audit:log', 0, 24);
    });

    it('should use default limit of 50', async () => {
      mockRedis.lrange.mockResolvedValueOnce([]);

      await auditLog.getRecent();

      expect(mockRedis.lrange).toHaveBeenCalledWith('mcp:audit:log', 0, 49);
    });

    it('should return empty array on redis error', async () => {
      mockRedis.lrange.mockRejectedValueOnce(new Error('Redis error'));

      const result = await auditLog.getRecent(10);

      expect(result).toEqual([]);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════
  // getByTool()
  // ═══════════════════════════════════════════════════════════════════════
  describe('getByTool', () => {
    it('should filter entries by toolId', async () => {
      const entries = [
        { id: '1', timestamp: new Date().toISOString(), toolId: 'figma', action: 'import', status: 'success' },
        { id: '2', timestamp: new Date().toISOString(), toolId: 'github', action: 'createIssue', status: 'success' },
        { id: '3', timestamp: new Date().toISOString(), toolId: 'figma', action: 'export', status: 'error' },
      ];
      mockRedis.lrange.mockResolvedValueOnce(entries.map((e) => JSON.stringify(e)));

      const result = await auditLog.getByTool('figma');

      expect(result).toHaveLength(2);
      for (const entry of result) {
        expect(entry.toolId).toBe('figma');
      }
    });

    it('should return empty array when no entries match toolId', async () => {
      const entries = [
        { id: '1', timestamp: new Date().toISOString(), toolId: 'slack', action: 'send', status: 'success' },
      ];
      mockRedis.lrange.mockResolvedValueOnce(entries.map((e) => JSON.stringify(e)));

      const result = await auditLog.getByTool('github');

      expect(result).toHaveLength(0);
    });

    it('should respect limit parameter', async () => {
      const entries = Array.from({ length: 20 }, (_, i) => ({
        id: `${i}`,
        timestamp: new Date().toISOString(),
        toolId: 'figma',
        action: 'run',
        status: 'success',
      }));
      mockRedis.lrange.mockResolvedValueOnce(entries.map((e) => JSON.stringify(e)));

      const result = await auditLog.getByTool('figma', 5);

      expect(result).toHaveLength(5);
    });

    it('should return empty array on redis error', async () => {
      mockRedis.lrange.mockRejectedValueOnce(new Error('Redis down'));

      const result = await auditLog.getByTool('figma');

      expect(result).toEqual([]);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════
  // getStats()
  // ═══════════════════════════════════════════════════════════════════════
  describe('getStats', () => {
    it('should return correct total count', async () => {
      const entries = [
        { id: '1', timestamp: new Date().toISOString(), toolId: 'figma', action: 'run', status: 'success' },
        { id: '2', timestamp: new Date().toISOString(), toolId: 'github', action: 'run', status: 'error' },
        { id: '3', timestamp: new Date().toISOString(), toolId: 'slack', action: 'run', status: 'success' },
      ];
      mockRedis.lrange.mockResolvedValueOnce(entries.map((e) => JSON.stringify(e)));

      const stats = await auditLog.getStats();

      expect(stats.total).toBe(3);
    });

    it('should aggregate byStatus correctly', async () => {
      const entries = [
        { id: '1', timestamp: new Date().toISOString(), toolId: 'a', action: 'run', status: 'success' },
        { id: '2', timestamp: new Date().toISOString(), toolId: 'b', action: 'run', status: 'success' },
        { id: '3', timestamp: new Date().toISOString(), toolId: 'c', action: 'run', status: 'error' },
        { id: '4', timestamp: new Date().toISOString(), toolId: 'd', action: 'run', status: 'denied' },
        { id: '5', timestamp: new Date().toISOString(), toolId: 'e', action: 'run', status: 'error' },
      ];
      mockRedis.lrange.mockResolvedValueOnce(entries.map((e) => JSON.stringify(e)));

      const stats = await auditLog.getStats();

      expect(stats.byStatus.success).toBe(2);
      expect(stats.byStatus.error).toBe(2);
      expect(stats.byStatus.denied).toBe(1);
    });

    it('should aggregate byTool correctly', async () => {
      const entries = [
        { id: '1', timestamp: new Date().toISOString(), toolId: 'figma', action: 'run', status: 'success' },
        { id: '2', timestamp: new Date().toISOString(), toolId: 'figma', action: 'run', status: 'error' },
        { id: '3', timestamp: new Date().toISOString(), toolId: 'figma', action: 'run', status: 'success' },
        { id: '4', timestamp: new Date().toISOString(), toolId: 'github', action: 'run', status: 'success' },
      ];
      mockRedis.lrange.mockResolvedValueOnce(entries.map((e) => JSON.stringify(e)));

      const stats = await auditLog.getStats();

      expect(stats.byTool.figma).toBe(3);
      expect(stats.byTool.github).toBe(1);
    });

    it('should handle empty entries', async () => {
      mockRedis.lrange.mockResolvedValueOnce([]);

      const stats = await auditLog.getStats();

      expect(stats.total).toBe(0);
      expect(stats.byStatus).toEqual({});
      expect(stats.byTool).toEqual({});
    });

    it('should return empty stats on redis error', async () => {
      mockRedis.lrange.mockRejectedValueOnce(new Error('Connection refused'));

      const stats = await auditLog.getStats();

      expect(stats).toEqual({ total: 0, byStatus: {}, byTool: {} });
    });

    it('should fetch all entries with lrange 0 -1', async () => {
      mockRedis.lrange.mockResolvedValueOnce([]);

      await auditLog.getStats();

      expect(mockRedis.lrange).toHaveBeenCalledWith('mcp:audit:log', 0, -1);
    });
  });
});
