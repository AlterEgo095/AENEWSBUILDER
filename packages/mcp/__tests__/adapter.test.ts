/**
 * MCP Adapter Tests
 */

import { vi, describe, it, expect, beforeEach } from 'vitest';

// ─── Mock dependencies BEFORE importing the adapter module ──────────────

const mockSpawn = vi.fn();
vi.mock('child_process', () => ({
  spawn: (...args: any[]) => mockSpawn(...args),
}));

vi.mock('pino', () => ({
  default: vi.fn(() => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  })),
}));

const mockRegistryGet = vi.fn();
const mockRegistryList = vi.fn();
const mockRegistryHas = vi.fn();
vi.mock('../registry.js', () => ({
  MCPRegistry: vi.fn().mockImplementation(() => ({
    get: (...args: any[]) => mockRegistryGet(...args),
    list: (...args: any[]) => mockRegistryList(...args),
    has: (...args: any[]) => mockRegistryHas(...args),
  })),
}));

// ─── Import adapter module (mocks are active) ────────────────────────────

import { MCPAdapter } from '../adapter.js';
import type { MCPExecutionResult } from '../adapter.js';

// ─── Helper: create a mock child process ─────────────────────────────────

function createMockProcess(opts: {
  stdout?: string;
  stderr?: string;
  exitCode?: number;
  delay?: number;
} = {}) {
  const listeners: Record<string, Array<(...args: any[]) => void>> = {};
  const proc: any = {
    killed: false,
    stdout: {
      on: (event: string, fn: (...args: any[]) => void) => {
        listeners[`stdout:${event}`] = listeners[`stdout:${event}`] || [];
        listeners[`stdout:${event}`].push(fn);
      },
    },
    stderr: {
      on: (event: string, fn: (...args: any[]) => void) => {
        listeners[`stderr:${event}`] = listeners[`stderr:${event}`] || [];
        listeners[`stderr:${event}`].push(fn);
      },
    },
    on: (event: string, fn: (...args: any[]) => void) => {
      listeners[event] = listeners[event] || [];
      listeners[event].push(fn);
    },
    kill: vi.fn(() => {
      proc.killed = true;
    }),
    // Helper to simulate process close
    _simulateClose: (code: number) => {
      if (listeners['close']) {
        for (const fn of listeners['close']) {
          fn(code);
        }
      }
    },
    // Helper to simulate stdout data
    _simulateStdout: (data: string) => {
      if (listeners['stdout:data']) {
        for (const fn of listeners['stdout:data']) {
          fn(Buffer.from(data));
        }
      }
    },
    // Helper to simulate stderr data
    _simulateStderr: (data: string) => {
      if (listeners['stderr:data']) {
        for (const fn of listeners['stderr:data']) {
          fn(Buffer.from(data));
        }
      }
    },
  };

  const { stdout = '', stderr = '', exitCode = 0, delay = 10 } = opts;

  mockSpawn.mockReturnValue(proc);

  // Automatically emit data and close after a short delay
  setTimeout(() => {
    if (stdout) {
      proc._simulateStdout(stdout);
    }
    if (stderr) {
      proc._simulateStderr(stderr);
    }
    proc._simulateClose(exitCode);
  }, delay);

  return proc;
}

describe('MCPAdapter', () => {
  let adapter: MCPAdapter;

  beforeEach(() => {
    vi.clearAllMocks();
    adapter = new MCPAdapter();
  });

  // ═══════════════════════════════════════════════════════════════════════
  // Constructor
  // ═══════════════════════════════════════════════════════════════════════
  describe('constructor', () => {
    it('should create an adapter instance', () => {
      expect(adapter).toBeInstanceOf(MCPAdapter);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════
  // execute()
  // ═══════════════════════════════════════════════════════════════════════
  describe('execute', () => {
    it('should return error for unknown tool', async () => {
      mockRegistryGet.mockReturnValue(undefined);

      const result = await adapter.execute('nonexistent-tool', {});

      expect(result.success).toBe(false);
      expect(result.error).toContain('Tool not found');
      expect(result.data).toBeUndefined();
    });

    it('should return success result for valid tool with JSON output', async () => {
      const tool = { name: 'test-tool', description: 'test', version: '1.0.0', params: {}, permissions: [] };
      mockRegistryGet.mockReturnValue(tool);
      createMockProcess({ stdout: JSON.stringify({ answer: 42 }), exitCode: 0 });

      const result = await adapter.execute('test-tool', { input: 'hello' });

      expect(result.success).toBe(true);
      expect(result.data).toEqual({ answer: 42 });
    });

    it('should return success result for valid tool with non-JSON output', async () => {
      const tool = { name: 'raw-tool', description: 'raw', version: '1.0.0', params: {}, permissions: [] };
      mockRegistryGet.mockReturnValue(tool);
      createMockProcess({ stdout: 'plain text output', exitCode: 0 });

      const result = await adapter.execute('raw-tool', {});

      expect(result.success).toBe(true);
      expect(result.data).toBe('plain text output');
    });

    it('should return error when container exits with non-zero code', async () => {
      const tool = { name: 'fail-tool', description: 'fail', version: '1.0.0', params: {}, permissions: [] };
      mockRegistryGet.mockReturnValue(tool);
      createMockProcess({ stderr: 'Something went wrong', exitCode: 1 });

      const result = await adapter.execute('fail-tool', {});

      expect(result.success).toBe(false);
      expect(result.error).toBe('Something went wrong');
    });

    it('should return error result when tool lookup throws', async () => {
      mockRegistryGet.mockImplementation(() => {
        throw new Error('Registry error');
      });

      const result = await adapter.execute('throwing-tool', {});

      expect(result.success).toBe(false);
      expect(result.error).toBe('Registry error');
    });

    it('should return duration > 0', async () => {
      const tool = { name: 'duration-tool', description: 'dur', version: '1.0.0', params: {}, permissions: [] };
      mockRegistryGet.mockReturnValue(tool);
      createMockProcess({ stdout: '{}', exitCode: 0, delay: 5 });

      const result = await adapter.execute('duration-tool', {});

      expect(result.duration).toBeGreaterThanOrEqual(0);
      expect(typeof result.duration).toBe('number');
    });

    it('should execute with various param types', async () => {
      const tool = { name: 'params-tool', description: 'params', version: '1.0.0', params: {}, permissions: [] };
      mockRegistryGet.mockReturnValue(tool);

      const capturedArgs: string[][] = [];
      mockSpawn.mockImplementation((...args: string[]) => {
        capturedArgs.push(args);
        return createMockProcess({ stdout: '{"ok":true}' });
      });

      // Object params
      await adapter.execute('params-tool', { foo: 'bar', nested: { a: 1 } });

      expect(mockSpawn).toHaveBeenCalled();
      const callArgs = mockSpawn.mock.calls[0];
      expect(callArgs[0]).toBe('docker');
      // The params should be passed as an env var
      const envIdx = callArgs[1].indexOf('-e');
      expect(envIdx).toBeGreaterThanOrEqual(0);
      const paramsStr = callArgs[1][envIdx + 1]; // PARAMS=...
      expect(paramsStr).toContain('foo');
      expect(paramsStr).toContain('bar');
    });

    it('should pass params with string values correctly', async () => {
      const tool = { name: 'str-tool', description: 'str', version: '1.0.0', params: {}, permissions: [] };
      mockRegistryGet.mockReturnValue(tool);
      createMockProcess({ stdout: '{"ok":true}' });

      const result = await adapter.execute('str-tool', { query: 'hello world' });

      expect(result.success).toBe(true);
    });

    it('should pass params with array values correctly', async () => {
      const tool = { name: 'arr-tool', description: 'arr', version: '1.0.0', params: {}, permissions: [] };
      mockRegistryGet.mockReturnValue(tool);
      createMockProcess({ stdout: '{"ok":true}' });

      const result = await adapter.execute('arr-tool', { tags: ['a', 'b', 'c'] });

      expect(result.success).toBe(true);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════
  // executeParallel()
  // ═══════════════════════════════════════════════════════════════════════
  describe('executeParallel', () => {
    it('should execute multiple tools and return array of results', async () => {
      const tool = { name: 'parallel-tool', description: 'p', version: '1.0.0', params: {}, permissions: [] };
      mockRegistryGet.mockReturnValue(tool);
      createMockProcess({ stdout: '{"result":"ok"}', exitCode: 0 });

      const tools = [
        { name: 'parallel-tool', params: { a: 1 } },
        { name: 'parallel-tool', params: { b: 2 } },
      ];

      const results = await adapter.executeParallel(tools);

      expect(results).toHaveLength(2);
      for (const result of results) {
        expect(result.success).toBe(true);
        expect(result).toHaveProperty('duration');
      }
    });

    it('should call execute for each tool', async () => {
      const tool = { name: 'count-tool', description: 'c', version: '1.0.0', params: {}, permissions: [] };
      mockRegistryGet.mockReturnValue(tool);
      createMockProcess({ stdout: '{}', exitCode: 0 });

      const tools = [
        { name: 'count-tool', params: {} },
        { name: 'count-tool', params: {} },
        { name: 'count-tool', params: {} },
      ];

      await adapter.executeParallel(tools);

      expect(mockRegistryGet).toHaveBeenCalledTimes(3);
    });

    it('should return array of results with proper structure', async () => {
      const tool = { name: 'struct-tool', description: 's', version: '1.0.0', params: {}, permissions: [] };
      mockRegistryGet.mockReturnValue(tool);
      createMockProcess({ stdout: '{"data":1}', exitCode: 0 });

      const results = await adapter.executeParallel([
        { name: 'struct-tool', params: {} },
      ]);

      expect(Array.isArray(results)).toBe(true);
      expect(results[0]).toHaveProperty('success');
      expect(results[0]).toHaveProperty('duration');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════
  // executeInContainer (tested indirectly through execute)
  // ═══════════════════════════════════════════════════════════════════════
  describe('executeInContainer (via execute)', () => {
    it('should spawn docker with correct isolation args', async () => {
      const tool = { name: 'docker-args-tool', description: 'da', version: '1.0.0', params: {}, permissions: [] };
      mockRegistryGet.mockReturnValue(tool);
      createMockProcess({ stdout: '{}', exitCode: 0 });

      await adapter.execute('docker-args-tool', {});

      const callArgs = mockSpawn.mock.calls[0];
      expect(callArgs[0]).toBe('docker');
      expect(callArgs[1]).toContain('run');
      expect(callArgs[1]).toContain('--rm');
      expect(callArgs[1]).toContain('--network');
      expect(callArgs[1]).toContain('none');
      expect(callArgs[1]).toContain('--memory');
      expect(callArgs[1]).toContain('256m');
      expect(callArgs[1]).toContain('--cpus');
      expect(callArgs[1]).toContain('0.5');
    });

    it('should pass params as PARAMS env var', async () => {
      const tool = { name: 'env-tool', description: 'e', version: '1.0.0', params: {}, permissions: [] };
      mockRegistryGet.mockReturnValue(tool);
      createMockProcess({ stdout: '{}', exitCode: 0 });

      await adapter.execute('env-tool', { key: 'value' });

      const callArgs = mockSpawn.mock.calls[0];
      const eIndex = callArgs[1].indexOf('-e');
      expect(eIndex).toBeGreaterThanOrEqual(0);
      const paramsStr = callArgs[1][eIndex + 1];
      expect(paramsStr).toContain('"key":"value"');
      expect(paramsStr).toMatch(/^PARAMS=/);
    });

    it('should use the correct image name based on tool name', async () => {
      const tool = { name: 'my-custom-tool', description: 'ct', version: '1.0.0', params: {}, permissions: [] };
      mockRegistryGet.mockReturnValue(tool);
      createMockProcess({ stdout: '{}', exitCode: 0 });

      await adapter.execute('my-custom-tool', {});

      const callArgs = mockSpawn.mock.calls[0];
      expect(callArgs[1]).toContain('aenews/mcp-my-custom-tool:latest');
    });

    it('should kill process on timeout', async () => {
      vi.useFakeTimers();
      const tool = { name: 'timeout-tool', description: 'to', version: '1.0.0', params: {}, permissions: [] };
      mockRegistryGet.mockReturnValue(tool);

      const proc: any = {
        killed: false,
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn() },
        on: vi.fn(),
        kill: vi.fn(() => { proc.killed = true; }),
      };
      mockSpawn.mockReturnValue(proc);

      // Execute and let timeout fire (30s in source)
      const resultPromise = adapter.execute('timeout-tool', {});

      // Fast-forward timers to trigger timeout
      vi.advanceTimersByTime(30000);

      const result = await resultPromise;
      expect(result.success).toBe(false);
      expect(result.error).toBe('MCP execution timeout');
      expect(proc.kill).toHaveBeenCalled();
      vi.useRealTimers();
    });

    it('should use default error message when stderr is empty on failure', async () => {
      const tool = { name: 'empty-err-tool', description: 'ee', version: '1.0.0', params: {}, permissions: [] };
      mockRegistryGet.mockReturnValue(tool);
      createMockProcess({ stderr: '', exitCode: 1 });

      const result = await adapter.execute('empty-err-tool', {});

      expect(result.success).toBe(false);
      expect(result.error).toBe('Container execution failed');
    });

    it('should parse JSON output and return parsed object', async () => {
      const tool = { name: 'json-tool', description: 'j', version: '1.0.0', params: {}, permissions: [] };
      mockRegistryGet.mockReturnValue(tool);
      const complexData = { items: [1, 2, 3], nested: { a: true } };
      createMockProcess({ stdout: JSON.stringify(complexData), exitCode: 0 });

      const result = await adapter.execute('json-tool', {});

      expect(result.success).toBe(true);
      expect(result.data).toEqual(complexData);
    });

    it('should handle empty stdout output as raw string', async () => {
      const tool = { name: 'empty-tool', description: 'et', version: '1.0.0', params: {}, permissions: [] };
      mockRegistryGet.mockReturnValue(tool);
      createMockProcess({ stdout: '', exitCode: 0 });

      const result = await adapter.execute('empty-tool', {});

      expect(result.success).toBe(true);
      expect(result.data).toBe('');
    });
  });
});
